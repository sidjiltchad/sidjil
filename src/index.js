// SIDJIL — الموجّه الرئيسي (Cloudflare Worker)
// يوزّع الطلبات فقط؛ كل المنطق في الوحدات المتخصصة.
import { routeApi } from './api.js';
import { routeAdminApi } from './admin-api.js';
import { routeDiscussionPublic } from './discussions.js';
import { renderPublic } from './views.js';
import { renderAdmin, renderResearcher } from './admin-views.js';
import { getSessionUser } from './lib/auth.js';
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

    // 1) واجهة الإدارة البرمجية
    if (pathname.startsWith('/api/v1/admin/')) {
      const res = await routeAdminApi(request, env);
      return res ?? json404();
    }

    // ترجمة المحتوى: API خفيف داخل العامل، ومعالجة PDF/OCR في خدمة منفصلة.
    if (pathname.startsWith('/api/v1/translate/') || pathname.startsWith('/api/v1/documents/')) {
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
             WHERE id = ? AND role = 'researcher' AND is_active = 1 AND is_verified = 1`
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

    // 1ب) مجلس سِجِل: النقاشات والتفاعلات والتسجيل (عامة)
    {
      const res = await routeDiscussionPublic(request, env);
      if (res) return res;
    }

    // 2) الواجهة البرمجية العامة + الملفات + خريطة الموقع
    if (
      pathname.startsWith('/api/v1/') ||
      pathname.startsWith('/file/') ||
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
      return renderResearcher(pathname, request, env, user);
    }

    // 4) صفحات الزوار العامة
    return renderPublic(pathname, request, env);
  },
};
