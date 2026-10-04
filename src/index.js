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
import { routeTranslationApi } from './translation.js';

function json404() {
  return new Response(JSON.stringify({ error: 'غير موجود' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'www.sidjil.org') {
      url.hostname = 'sidjil.org';
      return Response.redirect(url.toString(), 301);
    }
    const pathname = url.pathname;

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

    // ترجمة المحتوى: API خفيف داخل العامل، ومعالجة PDF/OCR في خدمة منفصلة.
    if (pathname.startsWith('/api/v1/translate/') || pathname.startsWith('/api/v1/documents/') || pathname.startsWith('/api/v1/manual-translations/')) {
      const res = await routeTranslationApi(request, env);
      if (res) return res;
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
      const headers = new Headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(issue.filename)}`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      });
      if (object.size != null) headers.set('Content-Length', String(object.size));
      if (object.range) {
        headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${issue.size}`);
        return new Response(object.body, { status: 206, headers });
      }
      return new Response(object.body, { headers });
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

    // 4) صفحات الزوار العامة
    // Public material pages can still expose translation controls to an
    // authenticated researcher. Pass the session-bound CSRF token into the
    // rendered HTML so requests from sidjil.org carry the same protection as
    // requests from app.sidjil.org. The token is never added to cached home
    // responses above.
    const publicUser = await getSessionUser(request, env);
    return renderPublic(pathname, request, env, { csrfToken: publicUser?.csrfToken || '' });
  },
};
