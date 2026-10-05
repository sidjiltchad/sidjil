// SIDJIL — الموجّه الرئيسي (Cloudflare Worker)
// يوزّع الطلبات فقط؛ كل المنطق في الوحدات المتخصصة.
import { routeApi } from './api.js';
import { routeAdminApi } from './admin-api.js';
import { routeDiscussionPublic } from './discussions.js';
import { routeSocialApi } from './social.js';
import { renderPublic } from './views.js';
import { renderAdmin, renderResearcher } from './admin-views.js';
import { getSessionUser, setSessionCookie } from './lib/auth.js';
import { rateLimitCheck, rateLimitResponse } from './lib/ratelimit.js';
import { googleStart, googleCallback } from './lib/google-auth.js';
import { addSidjilWatermark } from './lib/pdf-watermark.js';

function json404() {
  return new Response(JSON.stringify({ error: 'غير موجود' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function researcherSessionJsonError() {
  return new Response(JSON.stringify({ error: 'انتهت جلسة الباحث. سجّل الدخول من جديد.' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  );
}

function publicHomeCacheKey(request) {
  const url = new URL(request.url);
  const requestedLang = url.searchParams.get('lang');
  const cookieLang = (request.headers.get('cookie') || '').match(/(?:^|;\s*)archifouna_lang=(ar|fr)/)?.[1];
  const lang = requestedLang === 'fr' || requestedLang === 'ar'
    ? requestedLang
    : (cookieLang || 'ar');
  url.search = '';
  url.searchParams.set('lang', lang);
  return new Request(url.toString(), { method: 'GET' });
}

const RESEARCHER_APP_HOST = 'app.sidjil.org';
const DEFAULT_CAPACITOR_ORIGINS = new Set(['https://localhost']);

function capacitorOrigin(request, env) {
  const origin = String(request.headers.get('Origin') || '').trim();
  if (!origin) return '';
  const configured = String(env.CAPACITOR_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = configured.length ? new Set(configured) : DEFAULT_CAPACITOR_ORIGINS;
  return allowed.has(origin) ? origin : '';
}

function withCapacitorCors(request, env, response) {
  if (!(response instanceof Response)) return response;
  const origin = capacitorOrigin(request, env);
  const pathname = new URL(request.url).pathname;
  const allowedPath = pathname.startsWith('/api/v1/admin/')
    || pathname === '/researcher/feed'
    || pathname === '/researcher/search'
    || /^\/api\/v1\/materials\/\d+\/details$/.test(pathname)
    || /^\/api\/v1\/materials\/\d+\/translations$/.test(pathname)
    || pathname.startsWith('/file/')
    || pathname.startsWith('/researcher/profile/')
    || pathname.startsWith('/researcher/avatar');
  if (!origin || !allowedPath) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type, X-CSRF-Token');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (pathname.startsWith('/file/')) headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, ETag, Accept-Ranges, Content-Range');
  const vary = headers.get('Vary') || '';
  if (!/(^|,\s*)Origin(,|$)/i.test(vary)) headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isResearcherAppHost(url) {
  return url.hostname.toLowerCase() === RESEARCHER_APP_HOST;
}

function researcherAppRedirect(pathname, request, sessionToken = '') {
  const target = new URL(request.url);
  target.hostname = RESEARCHER_APP_HOST;
  target.pathname = pathname;
  const headers = new Headers({ Location: target.toString() });
  if (sessionToken) {
    // Promote a valid legacy host-only session to the shared SIDJIL cookie,
    // then remove the old host-only cookie on sidjil.org.
    headers.append('Set-Cookie', setSessionCookie(sessionToken, request.url));
    const secure = String(request.url).startsWith('https') ? '; Secure' : '';
    headers.append('Set-Cookie', `archifouna_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
  }
  return new Response(null, { status: 302, headers });
}

async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'www.sidjil.org') {
      url.hostname = 'sidjil.org';
      return Response.redirect(url.toString(), 301);
    }
    const pathname = url.pathname;

    // Capacitor's bundled shell uses a controlled HTTPS localhost origin.
    // Reply to its preflight without touching authentication or the database.
    if (request.method === 'OPTIONS' && (pathname.startsWith('/api/v1/admin/') || pathname === '/researcher/feed' || pathname === '/researcher/search' || /^\/api\/v1\/materials\/\d+\/(details|translations)$/.test(pathname) || pathname.startsWith('/file/') || pathname.startsWith('/researcher/profile/')) && capacitorOrigin(request, env)) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': capacitorOrigin(request, env),
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Accept, Content-Type, X-CSRF-Token',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Max-Age': '600',
          'Vary': 'Origin',
        },
      });
    }

    // Google OAuth للباحثين — اختياري ويُفعّل عبر أسرار Cloudflare.
    if (pathname === '/auth/google/start') return googleStart(request, env);
    if (pathname === '/auth/google/callback') return googleCallback(request, env);

    // تحديد معدل الطلبات على مستوى الخادم (قبل أي توجيه)
    const rl = rateLimitCheck(request, clientIp(request));
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const researcherAppHost = isResearcherAppHost(url);

    // 1) واجهة الإدارة البرمجية
    if (pathname.startsWith('/api/v1/admin/')) {
      const res = await routeAdminApi(request, env);
      return res ?? json404();
    }

    // مسارات الترجمة الآلية القديمة أزيلت لصالح نظائر Word المرفوعة يدويًا.
    if (pathname.startsWith('/api/v1/translate/') || pathname.startsWith('/api/v1/documents/') || pathname.startsWith('/api/v1/manual-translations/')) {
      return new Response(JSON.stringify({ error: 'مسار الترجمة القديم غير متاح' }), { status: 410, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    // صور حسابات الباحثين المخزنة في R2 — لا تُعرض إلا لجلسة باحث صالحة.
    const researcherAvatarMatch = pathname.match(/^\/researcher\/avatar(?:\/(\d+))?$/);
    if (researcherAvatarMatch) {
      const viewer = await getSessionUser(request, env);
      if (!viewer) return new Response('غير مصرح', { status: 401 });
      const avatarUser = researcherAvatarMatch[1]
        ? await env.DB.prepare(
            `SELECT avatar_r2_key FROM admin_users
            WHERE id = ? AND role = 'researcher' AND is_active = 1`
          ).bind(Number(researcherAvatarMatch[1])).first()
        : viewer;
      if (!avatarUser || !avatarUser.avatar_r2_key) return new Response('غير موجود', { status: 404 });
      const object = await env.FILES.get(avatarUser.avatar_r2_key);
      if (!object) return new Response('غير موجود', { status: 404 });
      const headers = new Headers({
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'private, no-store',
      });
      if (object.size != null) headers.set('Content-Length', String(object.size));
      return new Response(object.body, { headers });
    }

    const journalPdfMatch = pathname.match(/^\/journal\/issues\/(\d+)\/pdf$/);
    if (journalPdfMatch && request.method === 'GET') {
      const issue = await env.DB.prepare('SELECT r2_key, filename, size FROM journal_pdf_issues WHERE id = ?').bind(Number(journalPdfMatch[1])).first();
      if (!issue) return new Response('غير موجود', { status: 404 });
      const object = await env.FILES.get(issue.r2_key, request.headers.has('range') ? { range: request.headers } : undefined);
      if (!object) return new Response('غير موجود', { status: 404 });
      const disposition = new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline';
      let body = object.body;
      let bodySize = object.size;
      const shouldWatermark = url.searchParams.has('download') || url.searchParams.get('watermark') === '1';
      // النسخة المصدّرة فقط تُختم؛ القراءة العادية تبقى قابلة للـ Range وPDF.js.
      if (shouldWatermark && !request.headers.has('range')) {
        try {
          const stamped = await addSidjilWatermark(await object.arrayBuffer());
          body = stamped;
          bodySize = stamped.byteLength;
        } catch {
          return new Response('تعذّر تجهيز نسخة PDF المصدّرة', { status: 500 });
        }
      }
      const headers = new Headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(issue.filename)}`,
        'Cache-Control': shouldWatermark ? 'private, no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      });
      if (bodySize != null) headers.set('Content-Length', String(bodySize));
      if (object.range) {
        headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${issue.size}`);
        return new Response(object.body, { status: 206, headers });
      }
      return new Response(body, { headers });
    }

    // app.sidjil.org is the isolated researcher application. Its entry points
    // use the existing researcher feed and database instead of the legacy
    // public council page. Anonymous visitors still receive the login gate.
    if (researcherAppHost && request.method === 'GET') {
      if (pathname === '/' || pathname === '/discussions') {
        const user = await getSessionUser(request, env);
        if (!user) return renderPublic('/discussions', request, env, { standaloneResearcherLogin: true });
        if (user.role === 'admin') return Response.redirect('https://sidjil.org/admin', 302);
        return renderResearcher('/researcher', request, env, user);
      }

      const appDiscussionMatch = pathname.match(/^\/discussion\/(\d+)$/);
      if (appDiscussionMatch) {
        const user = await getSessionUser(request, env);
        if (!user) return renderPublic(pathname, request, env, { standaloneResearcherLogin: true });
        if (user.role === 'admin') return Response.redirect('https://sidjil.org/admin', 302);
        const mapped = new URL('/researcher/discussions', request.url);
        mapped.searchParams.set('focus', appDiscussionMatch[1]);
        const mappedRequest = new Request(mapped.toString(), request);
        return renderResearcher(mapped.pathname, mappedRequest, env, user);
      }
    }

    if (researcherAppHost && pathname === '/admin/login' && request.method === 'GET') {
      const appHome = new URL('/', request.url);
      const requestedLang = url.searchParams.get('lang');
      if (requestedLang === 'ar' || requestedLang === 'fr') appHome.searchParams.set('lang', requestedLang);
      return Response.redirect(appHome.toString(), 302);
    }

    // Keep existing links working while making app.sidjil.org the canonical
    // home for the private researcher surface.
    if (!researcherAppHost && (pathname === '/researcher' || pathname.startsWith('/researcher/'))) {
      const legacyUser = await getSessionUser(request, env);
      return researcherAppRedirect(pathname, request, legacyUser ? legacyUser.sessionToken : '');
    }

    // Cache the public home page at each edge location so repeated visits do
    // not rerun its several aggregate D1 queries on every request.
    if (!researcherAppHost && pathname === '/' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = publicHomeCacheKey(request);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const response = new Response(cached.body, cached);
        const requestedLang = url.searchParams.get('lang');
        if (requestedLang === 'ar' || requestedLang === 'fr') {
          response.headers.append('Set-Cookie', `archifouna_lang=${requestedLang}; Path=/; SameSite=Lax; Max-Age=31536000`);
        }
        return response;
      }
      const response = await renderPublic(pathname, request, env);
      if (response.status === 200) {
        const headers = new Headers(response.headers);
        headers.delete('Set-Cookie');
        headers.set('Cache-Control', 'public, max-age=300');
        const cacheable = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        ctx.waitUntil(cache.put(cacheKey, cacheable));
      }
      return response;
    }

    // 1ب) مجلس سِجِل: النقاشات والتفاعلات والتسجيل (عامة)
    {
      const res = await routeDiscussionPublic(request, env);
      if (res) return res;
    }

    // 1ج) الشبكة الاجتماعية: المتابعة والخلاصة والتنبيهات (جلسة باحث)
    if (pathname.startsWith('/api/v1/social/')) {
      const res = await routeSocialApi(request, env);
      if (res) return res;
    }

    // 2) الواجهة البرمجية العامة + الملفات + خريطة الموقع
    if (
      pathname.startsWith('/api/v1/') ||
      pathname.startsWith('/file/') ||
      pathname.startsWith('/discussion-file/') ||
      pathname === '/sitemap.xml'
    ) {
      const res = await routeApi(request, env);
      return res ?? json404();
    }

    // 3) صفحات لوحة الإدارة (تتطلب جلسة)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const clean =
        pathname.length > 1 && pathname.endsWith('/')
          ? pathname.slice(0, -1)
          : pathname;
      if (clean === '/admin/login') {
        return renderAdmin('/admin/login', request, env, null);
      }
      const user = await getSessionUser(request, env);
      if (!user) {
        return Response.redirect(new URL('/admin/login', request.url).toString(), 302);
      }
      return renderAdmin(clean, request, env, user);
    }

    // 3ب) مساحة الباحث (تتطلب جلسة؛ renderResearcher يوجّه المديرين إلى /admin)
    // استثناء: صفحة تسجيل الباحثين عامة (التوثيق لاحقًا من الإدارة)
    if (pathname === '/researcher' || (pathname.startsWith('/researcher/') && pathname !== '/researcher/register')) {
      const user = await getSessionUser(request, env);
      if (!user) {
        // الـShell يتعامل مع موجز الباحث كـJSON؛ لا نعيده إلى صفحة HTML
        // عند انتهاء الجلسة حتى يستطيع العميل عرض حالة تسجيل الدخول مباشرة.
        const jsonPath = pathname === '/researcher/feed' || pathname === '/researcher/search' || pathname.startsWith('/researcher/profile/');
        if (jsonPath && capacitorOrigin(request, env)) {
          return researcherSessionJsonError();
        }
        const loginUrl = new URL('/discussions', request.url);
        const next = `${pathname}${url.search}`;
        loginUrl.searchParams.set('next', next);
        if (url.searchParams.get('lang')) loginUrl.searchParams.set('lang', url.searchParams.get('lang'));
        return Response.redirect(loginUrl.toString(), 302);
      }
      if (researcherAppHost && user.role === 'admin') {
        return Response.redirect('https://sidjil.org/admin', 302);
      }
      return renderResearcher(pathname, request, env, user);
    }

    // لا تعرض واجهات الأرشيف العام داخل تطبيق الباحثين. تبقى الملفات وواجهات
    // API التي استُخدمت أعلاه متاحة للبطاقات والقارئ، أما صفحات الموقع العام
    // فتخرج إلى النطاق الرسمي بوضوح بدل خلط التطبيقين.
    if (researcherAppHost && request.method === 'GET') {
      const publicUrl = new URL(request.url);
      publicUrl.hostname = 'sidjil.org';
      return Response.redirect(publicUrl.toString(), 302);
    }

    // 4) صفحات الزوار العامة
    // Public material pages can still expose translation controls to an
    // authenticated researcher. Pass the session-bound CSRF token into the
    // rendered HTML so requests from sidjil.org carry the same protection as
    // requests from app.sidjil.org. The token is never added to cached home
    // responses above.
    const publicUser = await getSessionUser(request, env);
    return renderPublic(pathname, request, env, { csrfToken: publicUser?.csrfToken || '' });
}

function withSecurityHeaders(response) {
  if (!(response instanceof Response)) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.cloudflare.com https://*.sidjil.org https://cloudflareinsights.com https://*.cloudflareinsights.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "object-src 'self' blob:"
  ].join('; '));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);
    return withSecurityHeaders(withCapacitorCors(request, env, response));
  },
};
