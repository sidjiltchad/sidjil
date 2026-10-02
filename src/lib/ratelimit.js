// ============================================================
// SIDJIL — تحديد معدل الطلبات (نافذة منزلقة في الذاكرة)
//
// ⚠ قيد معماري موثّق: هذه الخريطة في ذاكرة الـ isolate الواحد.
// في الإنتاج (Workers بعدة isolates) يكون الحد تقريبيًا لكل isolate
// وليس عالميًا. للحد الصارم عالميًا استخدم Cloudflare Rate Limiting
// Rules على مستوى الحساب أو Durable Object مركزي.
// ============================================================

const buckets = new Map(); // key → [timestamps...]

function now() {
  return Date.now();
}

/**
 * check(key, limit, windowMs) → { allowed, retryAfter }
 * نافذة منزلقة: يحتفظ بالطوابع الزمنية داخل النافذة فقط.
 */
export function check(key, limit, windowMs) {
  const t = now();
  let arr = buckets.get(key);
  if (!arr) {
    arr = [];
    buckets.set(key, arr);
  }
  // تنظيف خارج النافذة
  while (arr.length && arr[0] <= t - windowMs) arr.shift();
  if (arr.length >= limit) {
    return { allowed: false, retryAfter: Math.ceil((arr[0] + windowMs - t) / 1000) };
  }
  arr.push(t);
  return { allowed: true, retryAfter: 0 };
}

/** تنظيف دوري للذاكرة (يُستدعى عند الحاجة) */
export function sweep() {
  const t = now();
  for (const [k, arr] of buckets) {
    while (arr.length && arr[0] <= t - 10 * 60 * 1000) arr.shift();
    if (!arr.length) buckets.delete(k);
  }
}

// ---------- السياسة ----------
// حدود معتدلة لا تعرقل الباحث الطبيعي؛ الأشد على العمليات الحساسة.

const MIN = 60 * 1000;

const POLICY = [
  // [prefix matcher, limit/دقيقة, scope]
  { match: (p) => p === '/api/v1/admin/login', limit: 10, window: MIN, scope: 'ip' },        // تسجيل الدخول: الأشد
  { match: (p) => p.includes('/ocr') || p.includes('/segments'), limit: 30, window: MIN, scope: 'ip' }, // OCR والترجمة
  { match: (p) => p.startsWith('/api/v1/admin/'), limit: 300, window: MIN, scope: 'ip' },   // عمليات إدارية
  { match: (p) => p === '/api/v1/reactions', limit: 30, window: MIN, scope: 'ip' }, // تفاعلات الزوار
  { match: (p) => p === '/api/v1/researcher/register', limit: 5, window: 60 * MIN, scope: 'ip' }, // تسجيل الباحثين: 5/ساعة
  { match: (p) => p === '/api/v1/search', limit: 60, window: MIN, scope: 'ip' },             // البحث العام
  { match: (p) => p.startsWith('/file/'), limit: 60, window: MIN, scope: 'ip' },            // التنزيلات
];

/**
 * rateLimitCheck(req, clientIp) → { allowed, retryAfter, rule }
 * يُستدعى من الموجه الرئيسي قبل التوجيه.
 */
export function rateLimitCheck(req, clientIp) {
  const url = new URL(req.url);
  const path = url.pathname;
  const ip = clientIp || 'unknown';

  for (const rule of POLICY) {
    if (rule.match(path)) {
      const key = `${rule.scope}:${ip}:${path.split('?')[0]}`;
      const r = check(key, rule.limit, rule.window);
      if (!r.allowed) return { allowed: false, retryAfter: r.retryAfter, rule };
      return { allowed: true, retryAfter: 0, rule: null };
    }
  }
  return { allowed: true, retryAfter: 0, rule: null };
}

export function rateLimitResponse(retryAfter) {
  return new Response(JSON.stringify({ error: 'طلبات كثيرة جدًا — حاول لاحقًا' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(Math.max(1, retryAfter)),
    },
  });
}
