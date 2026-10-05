#!/usr/bin/env python3
"""SIDJIL — تصنيف لغوي لملفات الإنتاج الحالية (ar|fr|en|undetermined).

المنطق:
- PDF نصي: استخراج أول 5 صفحات، حساب نسبة المحارف العربية مقابل اللاتينية،
  ثم التمييز بين الفرنسية والإنجليزية بتكرار كلمات شائعة.
- PDF ممسوح (بلا نص) / صور / غيرها: اسم الملف (محارف عربية ← ar)،
  وإلا 'undetermined' ليُصنَّف يدويًا من قسم الترجمة.
- المخرجات: ملف SQL بتحديثات files.lang، يُطبَّق عبر:
    npx wrangler d1 execute SIDJIL --remote --command="$(cat updates.sql)"
  (يُقسَّم تلقائيًا إلى دفعات 40 تحديثًا).

الاستخدام:
    python3 scripts/classify-file-languages.py            # يجلب القائمة وينزّل العينات
    python3 scripts/classify-file-languages.py --apply   # (يعرض أوامر التطبيق فقط)
"""
import json
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)

AR_RE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]')
LATIN_RE = re.compile(r'[A-Za-zÀ-ÿ]')

FR_WORDS = {
    'le', 'la', 'les', 'des', 'une', 'est', 'dans', 'pour', 'par', 'sur', 'avec',
    'qui', 'que', 'aux', 'ces', 'son', 'sa', 'ses', 'cette', 'entre', 'comme',
    'plus', 'tout', 'nous', 'vous', 'ils', 'sont', 'été', 'être', 'avoir',
}
EN_WORDS = {
    'the', 'and', 'of', 'to', 'in', 'is', 'was', 'were', 'for', 'with', 'on',
    'that', 'this', 'from', 'are', 'be', 'by', 'as', 'at', 'an', 'it', 'he',
    'his', 'her', 'they', 'their', 'which', 'or', 'not', 'have', 'has',
}
FR_CHARS = set('éèêëàâäçîïôöùûüÿæœ')


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def d1_remote(sql):
    r = run(['npx', 'wrangler', 'd1', 'execute', 'SIDJIL', '--remote', '--command=' + sql])
    out = r.stdout + r.stderr
    m = re.search(r'"results":\s*(\[.*?\])\s*,\s*"success"', out, re.S)
    if not m:
        print('D1 query failed:', out[-500:], file=sys.stderr)
        sys.exit(1)
    return json.loads(m.group(1))


def classify_text(text):
    ar = len(AR_RE.findall(text))
    lat = len(LATIN_RE.findall(text))
    total = ar + lat
    if total < 60:
        return None
    if ar / total > 0.45:
        return 'ar'
    if lat / total < 0.55:
        return None
    words = re.findall(r"[a-zà-ÿ']+", text.lower())
    if not words:
        return None
    fr_score = sum(1 for w in words if w in FR_WORDS) + sum(1 for ch in text.lower() if ch in FR_CHARS) * 0.5
    en_score = sum(1 for w in words if w in EN_WORDS)
    if fr_score == 0 and en_score == 0:
        return None
    return 'fr' if fr_score >= en_score else 'en'


def filename_hint(filename):
    if AR_RE.search(filename or ''):
        return 'ar'
    return None


def main():
    rows = d1_remote(
        "SELECT f.id, f.filename, f.mime, f.r2_key, m.title_ar, m.title_orig "
        "FROM files f JOIN materials m ON m.id = f.material_id "
        "WHERE f.kind IN ('original','attachment')"
    )
    print(f'الملفات: {len(rows)}', file=sys.stderr)
    updates = []
    stats = {'ar': 0, 'fr': 0, 'en': 0, 'undetermined': 0}
    tmp = tempfile.mkdtemp(prefix='sidjil-lang-')
    for row in rows:
        fid, filename, mime, r2_key = row['id'], row['filename'], row['mime'] or '', row['r2_key']
        lang = None
        is_pdf = mime == 'application/pdf' or (filename or '').lower().endswith('.pdf')
        if is_pdf and r2_key:
            dest = os.path.join(tmp, f'{fid}.pdf')
            r = run(['npx', 'wrangler', 'r2', 'object', 'get', 'sidjil-assets', r2_key,
                     '--remote', '--file=' + dest])
            if r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 0:
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(dest)
                    texts = []
                    for p in reader.pages[:5]:
                        try:
                            texts.append(p.extract_text() or '')
                        except Exception:
                            pass
                    lang = classify_text('\n'.join(texts))
                except Exception as e:
                    print(f'  [تحذير] تعذّر قراءة PDF للملف {fid}: {e}', file=sys.stderr)
            try:
                os.remove(dest)
            except OSError:
                pass
        if not lang:
            lang = filename_hint(filename) or filename_hint(row.get('title_ar') or '')
        if not lang:
            lang = 'undetermined'
        updates.append((fid, lang))
        stats[lang] += 1
        print(f'  {fid}: {lang}  {(filename or "")[:60]}', file=sys.stderr)

    out_path = os.path.join(REPO, 'scripts', 'file-lang-updates.sql')
    with open(out_path, 'w', encoding='utf-8') as f:
        for fid, lang in updates:
            f.write(f"UPDATE files SET lang = '{lang}' WHERE id = {fid};\n")
    print(f'\nكُتب {len(updates)} تحديثًا في scripts/file-lang-updates.sql', file=sys.stderr)
    print('الإحصاء:', stats, file=sys.stderr)
    # دفعات التطبيق (40 تحديثًا لكل أمر)
    batches = [' '.join(f"UPDATE files SET lang = '{l}' WHERE id = {i};"
                        for i, l in updates[j:j + 40])
               for j in range(0, len(updates), 40)]
    bpath = os.path.join(REPO, 'scripts', 'file-lang-batches.txt')
    with open(bpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(batches))
    print(f'دفعات التطبيق ({len(batches)}) في scripts/file-lang-batches.txt', file=sys.stderr)


if __name__ == '__main__':
    main()
