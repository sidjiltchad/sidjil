// ============================================================
// SIDJIL — تجريد OCR بمزود قابل للتبديل
// OCRProvider.extract(file, options) →
//   { text, language, page_number, confidence, provider, status, error }
// ============================================================

/**
 * المزود الأساسي (مجرد): يحدد العقد فقط.
 * كل مزود فعلي يرث منه ويطبق extract().
 */
export class OCRProvider {
  /**
   * @param {Blob|ArrayBuffer} file بيانات الملف (صورة أو PDF صفحة)
   * @param {{ language?: string, pageNumber?: number, timeoutMs?: number }} options
   * @returns {Promise<{text, language, page_number, confidence, provider, status, error}>}
   */
  async extract(file, options = {}) {
    throw new Error('extract() غير منفذة في هذا المزود');
  }

  /** اسم المزود للعرض والتسجيل */
  get name() {
    return 'base';
  }
}

/**
 * محوّل HTTP عام: يرسل الملف إلى endpoint خارجي قابل للضبط
 * عبر متغيرات البيئة OCR_ENDPOINT و OCR_API_KEY.
 *
 * البروتوكول المتوقع من الخدمة:
 *   POST {OCR_ENDPOINT} — multipart/form-data مع حقل file (+ language, page_number)
 *   → 200 JSON: { text, language, confidence, pages: [{page_number, text, confidence}] }
 *
 * لا يحتوي أي منطق خاص بمزود بعينه — أي خدمة تحقق هذا البروتوكول
 * يمكن ربطها دون تعديل بقية النظام.
 */
export class HttpOCRAdapter extends OCRProvider {
  constructor(env) {
    super();
    this.endpoint = env.OCR_ENDPOINT || '';
    this.apiKey = env.OCR_API_KEY || '';
  }

  get name() {
    return 'http-ocr';
  }

  get configured() {
    return !!this.endpoint;
  }

  async extract(file, options = {}) {
    if (!this.configured) {
      return {
        text: '',
        language: null,
        page_number: options.pageNumber ?? null,
        confidence: null,
        provider: this.name,
        status: 'failed',
        error: 'OCR_ENDPOINT غير مضبوط — لم يُربط أي مزود OCR',
      };
    }

    const body = file instanceof FormData ? file : this.buildForm(file, options);
    const headers = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(options.timeoutMs || 120000),
      });
    } catch (e) {
      return this.fail(options, `تعذّر الاتصال بخدمة OCR: ${e.message}`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      return this.fail(options, `رد غير صالح من خدمة OCR (HTTP ${res.status})`);
    }
    if (!res.ok) {
      return this.fail(options, data.error || `خدمة OCR رفضت الطلب (HTTP ${res.status})`);
    }

    // دمج الصفحات إن وُجدت، وإلا النص المباشر
    let text = '';
    let confidence = data.confidence ?? null;
    if (Array.isArray(data.pages) && data.pages.length) {
      text = data.pages
        .slice()
        .sort((a, b) => (a.page_number || 0) - (b.page_number || 0))
        .map((p) => p.text || '')
        .join('\n\n');
    } else {
      text = data.text || '';
    }

    return {
      text,
      language: data.language || options.language || null,
      page_number: options.pageNumber ?? (data.page_number ?? null),
      confidence,
      provider: data.provider || this.name,
      status: 'completed',
      error: null,
    };
  }

  buildForm(file, options) {
    const fd = new FormData();
    const bytes = file instanceof ArrayBuffer ? file : file; // ArrayBuffer | Blob | File
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
    fd.append('file', blob, 'input');
    if (options.language) fd.append('language', options.language);
    if (options.pageNumber !== undefined) fd.append('page_number', String(options.pageNumber));
    return fd;
  }

  fail(options, message) {
    return {
      text: '',
      language: options.language || null,
      page_number: options.pageNumber ?? null,
      confidence: null,
      provider: this.name,
      status: 'failed',
      error: message,
    };
  }
}

/**
 * مصنع المزود: يختار المحوّل حسب البيئة.
 * لتغيير المزود مستقبلًا: أضف Adapter جديدًا هنا دون مساس ببقية النظام.
 */
export function getOCRProvider(env) {
  return new HttpOCRAdapter(env);
}
