"""Internal PDF translation worker for SIDJIL."""
import asyncio
import os
import re
import subprocess
import tempfile
import time
import textwrap
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_JUSTIFY, TA_LEFT
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display
from fontTools.ttLib import TTFont as FontToolsFont

app = FastAPI(title='sidjil-translation-service', docs_url=None, redoc_url=None)
TOKEN = os.getenv('TRANSLATION_SERVICE_TOKEN', '')
MAX_PAGES = int(os.getenv('MAX_PDF_PAGES', '300'))
MAX_BYTES = int(os.getenv('MAX_PDF_BYTES', str(50 * 1024 * 1024)))
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://host.docker.internal:11434').rstrip('/')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'qwen3:8b')
OLLAMA_TEMPERATURE = float(os.getenv('OLLAMA_TEMPERATURE', '0.1'))
OLLAMA_KEEP_ALIVE = os.getenv('OLLAMA_KEEP_ALIVE', '30m')
OLLAMA_NUM_CTX = int(os.getenv('OLLAMA_NUM_CTX', '8192'))
OLLAMA_REQUEST_TIMEOUT = float(os.getenv('OLLAMA_REQUEST_TIMEOUT', '600'))
OLLAMA_MAX_RETRIES = max(1, int(os.getenv('OLLAMA_MAX_RETRIES', '3')))
OLLAMA_CHUNK_CHARS = max(800, min(2400, int(os.getenv('OLLAMA_CHUNK_CHARS', '1800'))))
OLLAMA_PREWARM = os.getenv('OLLAMA_PREWARM', '1').strip().lower() not in {'0', 'false', 'no', 'off'}
MAX_AI_TRANSLATION_JOBS = max(1, int(os.getenv('MAX_AI_TRANSLATION_JOBS', '1')))
AI_SEMAPHORE = asyncio.Semaphore(MAX_AI_TRANSLATION_JOBS)
AI_WAITING = 0
AI_ACTIVE = 0
AI_COMPLETED = 0
AI_FAILED = 0
AI_TOTAL_SECONDS = 0.0
OLLAMA_WARM = False
# Keep a strong reference to background jobs until they finish.  asyncio tasks
# are otherwise weakly referenced by the event loop and can be collected while
# an OCR or translation job is still running, leaving D1 at an intermediate stage.
BACKGROUND_TASKS: set[asyncio.Task] = set()


def keep_background_task(task: asyncio.Task) -> asyncio.Task:
    """Keep a startup or processing task alive until it completes."""
    BACKGROUND_TASKS.add(task)
    task.add_done_callback(BACKGROUND_TASKS.discard)
    return task


class Job(BaseModel):
    jobId: str
    inputKey: str
    contentHash: str
    fingerprint: str
    source: str = 'auto'
    target: Literal['ar', 'fr', 'en'] = 'ar'
    mode: Literal['translated', 'bilingual', 'text'] = 'translated'
    ocr: Literal['auto', 'advanced', 'off'] = 'auto'
    inputUrl: str
    outputUrl: str
    callback: str


class TextTranslation(BaseModel):
    q: str
    source: str = 'auto'
    target: Literal['ar', 'fr', 'en'] = 'ar'


def auth(token: str | None):
    if not TOKEN or token != TOKEN:
        raise HTTPException(401, 'unauthorized')


def language_label(language: str) -> str:
    return {'ar': 'Arabic', 'fr': 'French', 'en': 'English', 'auto': 'the source language detected from the text'}.get(language, language)


def clean_model_output(value: str) -> str:
    """Keep only the translation and never persist model reasoning."""
    text = str(value or '').replace('\ufeff', '')
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'</?think>', '', text, flags=re.IGNORECASE)
    text = text.replace('/no_think', '').strip()
    text = re.sub(r'^(?:translation|translated text|الترجمة)\s*:\s*', '', text, flags=re.IGNORECASE)
    return text.strip()


def translation_prompt(source: str, target: str) -> str:
    return (
        'You are the SIDJIL archival translation engine and must translate faithfully from '
        f'{language_label(source)} to {language_label(target)}. '
        'MANDATORY RULES: translate the complete text; never summarize, explain, annotate, '
        'simplify, censor, modernize, or add commentary; do not omit sentences, headings, '
        'footnotes, citations, dates, numbers, names, or terminology; preserve paragraph order, '
        'line breaks, list markers, document structure, and punctuation; preserve proper names '
        'carefully and do not invent translations for people or places; preserve every original '
        'number, date, year, page number, archival code, URL, email, acronym, and unfamiliar name '
        'exactly as written; preserve Markdown-style '
        '**bold** markers, quotation marks, bullets, and paragraph breaks when they appear; if something is unclear, '
        'translate conservatively instead of inventing meaning. Return ONLY the translated text. '
        'Never prefix it with Translation or any heading. Never output reasoning or <think> tags.'
    )


# These values are protected before the model sees a chunk.  Small local models are otherwise
# prone to dropping years, page numbers, archival identifiers, and mixed letter/number names
# while trying to make a fluent sentence.  The markers are restored byte-for-byte afterwards.
_LOSSLESS_TOKEN_RE = re.compile(
    r'(?<![\w])(?:'
    r'https?://[^\s<>]+'                         # URLs
    r'|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}'          # email addresses
    r'|[A-Z]{2,}(?:[-_/][A-Z0-9]+)+'              # archival codes
    r'|[A-ZÀ-ÖØ-Þ][a-zà-ÿ]+(?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ]+)+' # fused/unclear names (PierrePrints)
    r'|(?:Mr|Mrs|Ms|Mme|M|Dr|Prof)\.?\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ’\-]+' # titled names
    r'|[A-Za-zÀ-ÿ]*\d[A-Za-z0-9À-ÿ/_-]*'          # mixed identifiers (H2O, 1913a, ARC-1)
    r'|\d{1,4}(?:[.,/]\d{1,4})*(?:[-–—]\d{1,4})?' # dates and numbers
    r'|[٠-٩]+(?:[.,/]\s*[٠-٩]+)*(?:[-–—]\s*[٠-٩]+)?'
    r')(?![\w])'
)


def protect_lossless_tokens(value: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def replace(match: re.Match) -> str:
        token = match.group(0)
        marker = f'[[SIDJIL_TOKEN_{len(tokens)}]]'
        tokens.append(token)
        return marker

    return _LOSSLESS_TOKEN_RE.sub(replace, value), tokens


def restore_lossless_tokens(value: str, tokens: list[str]) -> tuple[str, list[str]]:
    restored = value
    missing: list[str] = []
    for index, token in enumerate(tokens):
        marker = f'[[SIDJIL_TOKEN_{index}]]'
        if marker in restored:
            restored = restored.replace(marker, token)
        else:
            missing.append(token)
    return restored, missing


async def ollama_probe() -> dict:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(f'{OLLAMA_BASE_URL}/api/tags')
            response.raise_for_status()
            models = response.json().get('models', [])
        names = [str(item.get('name', '')) for item in models]
        available = OLLAMA_MODEL in names
        return {'available': True, 'modelAvailable': available, 'models': names, 'error': None}
    except Exception as exc:
        return {'available': False, 'modelAvailable': False, 'models': [], 'error': str(exc)[:160]}


async def warm_ollama() -> None:
    """Load the configured model once so the first reader page is not cold-started."""
    global OLLAMA_WARM
    if not OLLAMA_PREWARM:
        return
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f'{OLLAMA_BASE_URL}/api/chat',
                json={
                    'model': OLLAMA_MODEL,
                    'stream': False,
                    'think': False,
                    'keep_alive': OLLAMA_KEEP_ALIVE,
                    'options': {'temperature': 0, 'num_ctx': min(2048, OLLAMA_NUM_CTX), 'num_predict': 1},
                    'messages': [
                        {'role': 'system', 'content': 'Reply with one short readiness token.'},
                        {'role': 'user', 'content': '/no_think\nready'},
                    ],
                },
            )
            response.raise_for_status()
        OLLAMA_WARM = True
    except Exception:
        # A failed warmup must never prevent the API from starting. The first
        # real request will still perform the normal provider health check.
        OLLAMA_WARM = False


@app.on_event('startup')
async def startup_warmup() -> None:
    if OLLAMA_PREWARM:
        keep_background_task(asyncio.create_task(warm_ollama()))


async def ollama_translate(text: str, source: str, target: str) -> str:
    global AI_WAITING, AI_ACTIVE, AI_COMPLETED, AI_FAILED, AI_TOTAL_SECONDS
    if not text.strip():
        return ''
    AI_WAITING += 1
    started = time.perf_counter()
    acquired = False
    try:
        async with AI_SEMAPHORE:
            acquired = True
            AI_WAITING = max(0, AI_WAITING - 1)
            AI_ACTIVE += 1
            protected_text, protected_tokens = protect_lossless_tokens(text)
            payload = {
                'model': OLLAMA_MODEL,
                'stream': False,
                'think': False,
                'keep_alive': OLLAMA_KEEP_ALIVE,
                'options': {'temperature': OLLAMA_TEMPERATURE, 'num_ctx': OLLAMA_NUM_CTX, 'num_predict': min(2048, max(512, len(text) * 2))},
                'messages': [
                    {'role': 'system', 'content': translation_prompt(source, target)},
                    {'role': 'user', 'content': '/no_think\n' + protected_text},
                ],
            }
            data = None
            last_error = None
            for attempt in range(OLLAMA_MAX_RETRIES):
                try:
                    async with httpx.AsyncClient(timeout=OLLAMA_REQUEST_TIMEOUT) as client:
                        response = await client.post(f'{OLLAMA_BASE_URL}/api/chat', json=payload)
                        if response.status_code == 400 and 'think' in response.text.lower() and 'think' in payload:
                            payload.pop('think', None)
                            response = await client.post(f'{OLLAMA_BASE_URL}/api/chat', json=payload)
                        if response.status_code in {408, 429, 500, 502, 503, 504}:
                            response.raise_for_status()
                        response.raise_for_status()
                        data = response.json()
                        break
                except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPStatusError) as exc:
                    last_error = exc
                    if attempt + 1 >= OLLAMA_MAX_RETRIES:
                        raise
                    await asyncio.sleep(min(20, 2 ** attempt))
            if data is None:
                raise last_error or RuntimeError('OLLAMA_EMPTY_RESPONSE')
            translated = clean_model_output((data.get('message') or {}).get('content', ''))
            if not translated:
                raise RuntimeError('OLLAMA_EMPTY_TRANSLATION')
            translated, missing_tokens = restore_lossless_tokens(translated, protected_tokens)
            # A second, short repair pass handles models that still drop a marker.  The final
            # fallback appends any remaining source token rather than silently losing it.
            if missing_tokens:
                repair_payload = {
                    'model': OLLAMA_MODEL,
                    'stream': False,
                    'think': False,
                    'keep_alive': OLLAMA_KEEP_ALIVE,
                    'options': {'temperature': 0, 'num_ctx': OLLAMA_NUM_CTX, 'num_predict': min(2048, max(512, len(protected_text) * 2))},
                    'messages': [
                        {'role': 'system', 'content': translation_prompt(source, target) + ' Every marker such as [[SIDJIL_TOKEN_0]] is mandatory and must appear exactly once in the output.'},
                        {'role': 'user', 'content': '/no_think\nTranslate this complete text and keep all markers exactly:\n' + protected_text + '\nRequired markers: ' + ', '.join(f'[[SIDJIL_TOKEN_{i}]]' for i in range(len(protected_tokens)))},
                    ],
                }
                try:
                    async with httpx.AsyncClient(timeout=OLLAMA_REQUEST_TIMEOUT) as client:
                        repaired_response = await client.post(f'{OLLAMA_BASE_URL}/api/chat', json=repair_payload)
                        repaired_response.raise_for_status()
                        repaired = clean_model_output((repaired_response.json().get('message') or {}).get('content', ''))
                    repaired, repaired_missing = restore_lossless_tokens(repaired, protected_tokens)
                    if repaired and len(repaired_missing) < len(missing_tokens):
                        translated, missing_tokens = repaired, repaired_missing
                except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPStatusError):
                    pass
            if missing_tokens:
                translated = translated.rstrip() + '\n' + ' '.join(missing_tokens)
            AI_COMPLETED += 1
            AI_TOTAL_SECONDS += time.perf_counter() - started
            return translated
    except Exception:
        AI_FAILED += 1
        raise
    finally:
        if acquired:
            AI_ACTIVE = max(0, AI_ACTIVE - 1)
        else:
            AI_WAITING = max(0, AI_WAITING - 1)


async def translate_layout(text: str, source: str, target: str) -> str:
    normalized = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    if not normalized.strip():
        return ''
    # Keep blank-line boundaries and use larger chunks to reduce model round trips.
    pieces = re.split(r'(\n\s*\n)', normalized)
    output: list[str] = []
    for piece in pieces:
        if not piece:
            continue
        if re.fullmatch(r'\n\s*\n', piece):
            output.append(piece)
            continue
        lines = piece.split('\n')
        chunks: list[str] = []
        current = ''
        for line in lines:
            if len(line) > OLLAMA_CHUNK_CHARS:
                if current:
                    chunks.append(current)
                    current = ''
                remainder = line
                while len(remainder) > OLLAMA_CHUNK_CHARS:
                    cut = remainder.rfind(' ', 0, OLLAMA_CHUNK_CHARS)
                    if cut < OLLAMA_CHUNK_CHARS // 2:
                        cut = OLLAMA_CHUNK_CHARS
                    chunks.append(remainder[:cut].rstrip())
                    remainder = remainder[cut:].lstrip()
                if remainder:
                    chunks.append(remainder)
                continue
            candidate = line if not current else current + '\n' + line
            if current and len(candidate) > OLLAMA_CHUNK_CHARS:
                chunks.append(current)
                current = line
            else:
                current = candidate
        if current:
            chunks.append(current)
        for index, chunk in enumerate(chunks):
            output.append(await ollama_translate(chunk, source, target))
            if index < len(chunks) - 1:
                output.append('\n')
    return ''.join(output)


async def engine_status() -> dict:
    probe = await ollama_probe()
    average = AI_TOTAL_SECONDS / AI_COMPLETED if AI_COMPLETED else 0
    return {
        'provider': 'ollama', 'model': OLLAMA_MODEL, 'languages': ['ar', 'fr', 'en'],
        'ollama': probe, 'ocrEnabled': True, 'queueLength': AI_WAITING,
        'activeAiJobs': AI_ACTIVE, 'maxAiJobs': MAX_AI_TRANSLATION_JOBS,
        'modelWarm': OLLAMA_WARM, 'chunkChars': OLLAMA_CHUNK_CHARS,
        'completedJobs': AI_COMPLETED, 'failedJobs': AI_FAILED,
        'averageTranslationTimeSeconds': round(average, 2),
    }


@app.get('/health')
async def health():
    status = await engine_status()
    ok = bool(TOKEN and os.getenv('SIDJIL_WORKER_URL') and status['ollama']['available'] and status['ollama']['modelAvailable'])
    payload = {'ok': ok, 'service': 'sidjil-translation-service', 'translationEngine': 'ollama', **status}
    return JSONResponse(payload, status_code=200 if ok else 503)


@app.get('/ready')
async def ready():
    status = await engine_status()
    ok = bool(TOKEN and os.getenv('SIDJIL_WORKER_URL') and status['ollama']['available'] and status['ollama']['modelAvailable'])
    return JSONResponse({'ok': ok, 'engines': {'pypdf': True, 'ollama': ok, 'ocr': True, 'pdfText': True}, **status}, status_code=200 if ok else 503)


@app.get('/engine')
async def engine(x_sidjil_service_token: str | None = Header(default=None)):
    auth(x_sidjil_service_token)
    return await engine_status()


@app.post('/jobs', status_code=202)
async def create_job(job: Job, x_sidjil_service_token: str | None = Header(default=None)):
    auth(x_sidjil_service_token)
    keep_background_task(asyncio.create_task(process(job)))
    return {'accepted': True, 'jobId': job.jobId}


@app.post('/translate')
async def translate_text(body: TextTranslation, x_sidjil_service_token: str | None = Header(default=None)):
    auth(x_sidjil_service_token)
    try:
        translated = await translate_layout(body.q, body.source, body.target)
    except Exception as exc:
        raise HTTPException(503, f'ollama_unavailable: {str(exc)[:160]}')
    return {'translatedText': translated, 'detectedLanguage': None, 'engine': 'ollama', 'model': OLLAMA_MODEL}


def ocr_languages(source: str) -> str:
    return {'ar': 'ara', 'fr': 'fra+eng', 'en': 'eng'}.get(source, 'ara+fra+eng')


def run_page_ocr(data: bytes, content_type: str, source: str) -> str:
    suffix = '.jpg' if 'jpeg' in content_type else '.png'
    with tempfile.TemporaryDirectory(prefix='sidjil-page-ocr-') as td:
        image = Path(td) / f'page{suffix}'
        image.write_bytes(data)
        result = subprocess.run(
            ['tesseract', str(image), 'stdout', '--psm', '3', '-l', ocr_languages(source)],
            check=True, capture_output=True, timeout=90,
        )
        return result.stdout.decode('utf-8', errors='replace').strip()


@app.post('/ocr')
async def ocr_page(request: Request, x_sidjil_service_token: str | None = Header(default=None), x_sidjil_ocr_source: str = Header(default='auto')):
    auth(x_sidjil_service_token)
    source = x_sidjil_ocr_source if x_sidjil_ocr_source in {'auto', 'ar', 'fr', 'en'} else 'auto'
    data = await request.body()
    if not data or len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, 'image_too_large')
    content_type = request.headers.get('content-type', 'image/png').split(';', 1)[0].lower()
    try:
        text = await asyncio.to_thread(run_page_ocr, data, content_type, source)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, 'ocr_timeout')
    except subprocess.CalledProcessError as exc:
        raise HTTPException(422, f'ocr_failed: {exc.stderr.decode("utf-8", errors="ignore")[-180:]}')
    return {'text': text, 'source': source}


async def callback(job: Job, **data):
    async with httpx.AsyncClient(timeout=20) as client:
        await client.patch(job.callback, headers={'X-Sidjil-Service-Token': TOKEN}, json=data)


async def download_input(job: Job, destination: Path):
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(job.inputUrl, headers={'X-Sidjil-Service-Token': TOKEN})
        r.raise_for_status()
        if len(r.content) > MAX_BYTES:
            raise RuntimeError('PDF_TOO_LARGE')
        destination.write_bytes(r.content)


async def upload_output(job: Job, source: Path, mime: str):
    data = source.read_bytes()
    if len(data) > MAX_BYTES * 2:
        raise RuntimeError('OUTPUT_TOO_LARGE')
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.put(job.outputUrl, headers={'X-Sidjil-Service-Token': TOKEN, 'Content-Type': mime}, content=data)
        r.raise_for_status()
        return r.json()


def run_ocr(src: Path, destination: Path, languages: str):
    cmd = ['ocrmypdf', '--deskew', '--rotate-pages', '--skip-text', '--language', languages, str(src), str(destination)]
    subprocess.run(cmd, check=True, timeout=1200, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def extract_page_text(page) -> str:
    try:
        text = page.extract_text(extraction_mode='layout') or ''
    except TypeError:
        text = page.extract_text() or ''
    return text.replace('\r\n', '\n').replace('\r', '\n').strip()


def detect_language(text: str, fallback: str = 'fr') -> str:
    """Small deterministic detector for the supported archival languages."""
    value = text or ''
    arabic = len(re.findall(r'[\u0600-\u06ff]', value))
    latin = len(re.findall(r'[A-Za-zÀ-ÿ]', value))
    if arabic >= max(8, latin // 3):
        return 'ar'
    # Keep an explicit source when supplied; otherwise historical Sidjil material is commonly French.
    return fallback if fallback in {'fr', 'en'} else 'fr'


def rtl_language(language: str) -> bool:
    return language == 'ar'


def app_font(name: str, source: str) -> str:
    source_path = Path('/app/fonts') / source
    ttf_path = Path('/tmp') / f'{name}.ttf'
    if not ttf_path.exists():
        font = FontToolsFont(str(source_path))
        font.flavor = None
        font.save(str(ttf_path))
    pdfmetrics.registerFont(TTFont(name, str(ttf_path)))
    return name


def rich_pdf_markup(value: str, language: str) -> str:
    """Turn simple archival structure into ReportLab markup without inventing content."""
    def shape_rtl(part: str) -> str:
        # ReportLab wraps text after it receives the string.  Since the bidi
        # renderer below produces visual-order Arabic, wrapping the whole
        # paragraph first would reverse the order of the resulting lines.  Wrap
        # the logical Arabic text into conservative word groups, then shape each
        # line independently so line 1 remains before line 2 when read RTL.
        logical_lines = textwrap.wrap(
            part,
            width=78,
            break_long_words=False,
            break_on_hyphens=False,
            replace_whitespace=False,
            drop_whitespace=True,
        ) or ['']

        def shape_line(logical_line: str) -> str:
        # Bidi reordering treats an unmarked number or Latin run as part of the
        # surrounding Arabic paragraph.  That reverses ranges such as 1895-1899,
        # moves ISBN fragments, and can attach a date to the neighbouring word.
        # Mark each LTR run before shaping, then turn the marks into an explicit
        # Latin font span after python-bidi has laid out the line.
            ltr_token = re.compile(r'(?<![A-Za-z0-9À-ÿ])([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ._/+:\-]*)(?![A-Za-z0-9À-ÿ])')
            marked = ltr_token.sub(lambda m: '\u200e' + m.group(1) + '\u200e', logical_line)
            shaped = get_display(arabic_reshaper.reshape(marked), base_dir='R')

            def latin_span(match: re.Match) -> str:
                return f'<font name="Helvetica">{match.group(1)}</font>'

            # The LRM delimiters are intentionally removed only after bidi has run;
            # leaving them in ReportLab would make extraction contain invisible marks.
            return re.sub('\u200e([^\u200e]+)\u200e', latin_span, shaped)

        return '<br/>'.join(shape_line(line) for line in logical_lines)

    safe_lines = []
    for raw in str(value or '').replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        escaped = raw.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        escaped = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', escaped)
        stripped = re.sub(r'<[^>]+>', '', escaped).strip()
        # Short standalone lines and archival labels read as headings.
        if stripped and len(stripped) <= 90 and not re.search(r'[.!؟:؛]$', stripped) and not stripped.startswith(('-', '•', '*', '»', '«', '"')):
            escaped = f'<b>{escaped}</b>'
        if rtl_language(language):
            parts = re.split(r'(<b>.*?</b>)', escaped)
            shaped = []
            for part in parts:
                if part.startswith('<b>') and part.endswith('</b>'):
                    shaped.append('<b>' + shape_rtl(part[3:-4]) + '</b>')
                else:
                    shaped.append(shape_rtl(part))
            escaped = ''.join(shaped)
        safe_lines.append(escaped)
    return '<br/>'.join(safe_lines)


def write_pdf(pages: list[tuple[str, str, str]], destination: Path, target: str, bilingual: bool = False, source: str | None = None):
    styles = getSampleStyleSheet()
    rtl_font = 'Helvetica'
    rtl_heading_font = 'Helvetica-Bold'
    app_body = Path('/app/fonts/ibm-plex-sans-arabic-400.woff2')
    if app_body.exists():
        rtl_font = app_font('SidjilIBM', app_body.name)
        app_heading = Path('/app/fonts/ibm-plex-sans-arabic-700.woff2')
        if app_heading.exists():
            rtl_heading_font = app_font('SidjilIBMHeading', app_heading.name)
    elif Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').exists():
        pdfmetrics.registerFont(TTFont('SidjilDejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        rtl_font = 'SidjilDejaVu'
    target_rtl = rtl_language(target)
    font_name = rtl_font if target_rtl else 'Helvetica'
    heading_font = rtl_heading_font if target_rtl else 'Helvetica-Bold'
    body_alignment = TA_RIGHT if target_rtl else TA_JUSTIFY
    # Arabic is shaped into visual-order runs in ``rich_pdf_markup`` because
    # ReportLab does not perform Arabic shaping itself.  The resulting string
    # must therefore be wrapped as an already-laid-out visual line; using
    # ReportLab's RTL wrapper a second time moves line starts and makes the
    # right-aligned paragraph look centred or out of order.
    body_wrap = 'LTR'
    style = ParagraphStyle('sidjil', parent=styles['BodyText'], fontName=font_name, fontSize=11, leading=19, alignment=body_alignment, wordWrap=body_wrap, splitLongWords=1, spaceAfter=10)
    title = ParagraphStyle('title', parent=style, fontName=heading_font or font_name, fontSize=15, leading=23, alignment=TA_RIGHT if target_rtl else TA_LEFT, spaceAfter=12)
    ltr_title = ParagraphStyle('ltr-title', parent=styles['BodyText'], fontName='Helvetica', fontSize=9, leading=13, alignment=TA_LEFT, textColor='#536273', spaceAfter=3)
    doc = SimpleDocTemplate(str(destination), pagesize=A4, rightMargin=22 * mm, leftMargin=22 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title='SIDJIL Translation')

    def watermark(canvas, _doc):
        canvas.saveState()
        try:
            canvas.setFillAlpha(0.10)
        except AttributeError:
            pass
        canvas.setFillColorRGB(0.08, 0.18, 0.38)
        canvas.setFont('Helvetica-Bold', 64)
        canvas.drawCentredString(A4[0] / 2, A4[1] / 2, 'SIDJIL')
        canvas.restoreState()

    story = []
    for n, (original, translated, page_source) in enumerate(pages, 1):
        story.append(Paragraph(f'SIDJIL · {target.upper()}', ltr_title))
        page_title = f'ترجمة الصفحة {n}' if target_rtl else f'Page {n}'
        story.append(Paragraph(rich_pdf_markup(page_title, target), title))
        if bilingual and original:
            original_lang = page_source or source or target
            original_rtl = rtl_language(original_lang)
            original_font = rtl_font if original_rtl else 'Helvetica'
            original_heading = rtl_heading_font if original_rtl else 'Helvetica-Bold'
            original_style = ParagraphStyle('original', parent=style, fontName=original_font, alignment=TA_RIGHT if original_rtl else TA_JUSTIFY, wordWrap='LTR')
            original_label = 'النص الأصلي' if original_rtl else 'Original text'
            original_title_style = ParagraphStyle('original-title', parent=title, fontName=original_heading, alignment=TA_RIGHT if original_rtl else TA_LEFT)
            story.append(Paragraph(rich_pdf_markup(original_label, original_lang), original_title_style))
            story.append(Paragraph(rich_pdf_markup(original, original_lang), original_style))
            story.append(Spacer(1, 5 * mm))
        translation_label = 'الترجمة' if target_rtl else 'Translation'
        story.append(Paragraph(rich_pdf_markup(translation_label, target), title))
        story.append(Paragraph(rich_pdf_markup(translated or '—', target), style))
        if n < len(pages): story.append(PageBreak())
    doc.build(story, onFirstPage=watermark, onLaterPages=watermark)


def format_pdf_text(value: str, target: str) -> str:
    value = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    if target == 'ar':
        value = get_display(arabic_reshaper.reshape(value))
    return value.replace('\n', '<br/>')


async def process(job: Job):
    try:
        with tempfile.TemporaryDirectory(prefix='sidjil-translation-') as td:
            src = Path(td) / 'original.pdf'
            await download_input(job, src)
            if src.stat().st_size > MAX_BYTES:
                raise RuntimeError('PDF_TOO_LARGE')
            await callback(job, status='ANALYZING', progress=5, currentStage='ANALYZING')
            reader = PdfReader(str(src), strict=False)
            if len(reader.pages) > MAX_PAGES:
                raise RuntimeError('PDF_TOO_MANY_PAGES')
            await callback(job, status='EXTRACTING', progress=12, currentStage='EXTRACTING', pageCount=len(reader.pages))
            texts = [extract_page_text(p) for p in reader.pages]
            if job.ocr != 'off' and sum(bool(x) for x in texts) < max(1, len(texts) // 3):
                await callback(job, status='OCR_PROCESSING', progress=20, currentStage='OCR_PROCESSING', ocrUsed=1)
                ocr_src = Path(td) / 'ocr.pdf'
                languages = 'ara+fra+eng' if job.ocr in ('auto', 'advanced') else 'eng'
                await asyncio.to_thread(run_ocr, src, ocr_src, languages)
                reader = PdfReader(str(ocr_src), strict=False)
                texts = [extract_page_text(p) for p in reader.pages]
            translated = []
            page_sources = []
            for n, text in enumerate(texts, 1):
                page_source = detect_language(text, job.source) if job.source == 'auto' else job.source
                page_sources.append(page_source)
                translated.append(await translate_layout(text, page_source, job.target) if text else '')
                await callback(job, status='TRANSLATING', progress=20 + int(n / max(1, len(texts)) * 60), currentStage='TRANSLATING', processedPages=n, pageCount=len(texts), detail=f'page {n}/{len(texts)}')
            if job.mode == 'text':
                output = Path(td) / 'translated.txt'
                # Keep a real page boundary in the text export.  The reader uses
                # the form-feed to render each translated page as selectable text;
                # it is still a normal UTF-8 text file when downloaded.
                output.write_text('\n\n\f\n\n'.join(translated), encoding='utf-8')
                mime = 'text/plain; charset=utf-8'
            else:
                output = Path(td) / 'translated.pdf'
                await callback(job, status='REBUILDING', progress=84, currentStage='REBUILDING', processedPages=len(texts), pageCount=len(texts))
                write_pdf(list(zip(texts, translated, page_sources)), output, job.target, bilingual=job.mode == 'bilingual', source=job.source)
                mime = 'application/pdf'
            await callback(job, status='UPLOADING', progress=94, currentStage='UPLOADING', processedPages=len(texts), pageCount=len(texts))
            stored = await upload_output(job, output, mime)
            await callback(job, status='COMPLETED', progress=100, currentStage='COMPLETED', outputKey=stored['outputKey'], outputMime=stored.get('outputMime', mime), outputSize=stored.get('outputSize', output.stat().st_size))
    except Exception as exc:
        message = str(exc)
        lowered = message.lower()
        if isinstance(exc, httpx.TimeoutException) or 'timeout' in lowered:
            code = 'OLLAMA_TIMEOUT'
        elif isinstance(exc, httpx.HTTPError) or 'ollama' in lowered:
            code = 'OLLAMA_UNAVAILABLE'
        else:
            code = type(exc).__name__
        await callback(job, status='FAILED', progress=0, currentStage='FAILED', errorCode=code, errorMessage=message[:240])
