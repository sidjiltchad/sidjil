// إحصاءات زوار الواجهة العامة دون تخزين عنوان IP الخام.

const BOT_RE = /bot|crawler|spider|slurp|headless|preview|facebookexternalhit|whatsapp/i;

function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') ||
    (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || 'unknown';
}

async function visitorHash(req, env) {
  const input = `${clientIp(req)}|${req.headers.get('User-Agent') || ''}|${env.SITE_URL || 'sidjil'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function trackVisitor(env, req, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const ua = req.headers.get('User-Agent') || '';
  if (BOT_RE.test(ua)) return;
  const hash = await visitorHash(req, env);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO visitor_daily (day, visitor_hash, first_seen_at, last_seen_at, views)
       VALUES (date('now'), ?, datetime('now'), datetime('now'), 1)
       ON CONFLICT(day, visitor_hash) DO UPDATE SET last_seen_at = datetime('now'), views = views + 1`
    ).bind(hash),
    env.DB.prepare(
      `INSERT INTO visitor_presence (visitor_hash, last_seen_at, last_path)
       VALUES (?, datetime('now'), ?)
       ON CONFLICT(visitor_hash) DO UPDATE SET last_seen_at = datetime('now'), last_path = excluded.last_path`
    ).bind(hash, String(pathname || '').slice(0, 240)),
  ]);
}

export async function getVisitorStats(env) {
  const [annual, monthly, daily, online] = await Promise.all([
    env.DB.prepare("SELECT COUNT(DISTINCT visitor_hash) AS c FROM visitor_daily WHERE day >= date('now', '-365 day')").first(),
    env.DB.prepare("SELECT COUNT(DISTINCT visitor_hash) AS c FROM visitor_daily WHERE day >= date('now', 'start of month')").first(),
    env.DB.prepare("SELECT COUNT(DISTINCT visitor_hash) AS c FROM visitor_daily WHERE day = date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM visitor_presence WHERE last_seen_at >= datetime('now', '-5 minutes')").first(),
  ]);
  return {
    annual: Number(annual?.c || 0),
    monthly: Number(monthly?.c || 0),
    daily: Number(daily?.c || 0),
    online: Number(online?.c || 0),
  };
}
