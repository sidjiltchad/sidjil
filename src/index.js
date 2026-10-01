// SIDJIL — الموجّه الرئيسي (Cloudflare Worker)
// يوزّع الطلبات فقط؛ كل المنطق في الوحدات المتخصصة.
import { routeApi } from './api.js';
import { routeAdminApi } from './admin-api.js';
import { renderPublic } from './views.js';
import { renderAdmin, renderResearcher } from './admin-views.js';
import { getSessionUser } from './lib/auth.js';
import { rateLimitCheck, rateLimitResponse } from './lib/ratelimit.js';

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

    // تحديد معدل الطلبات على مستوى الخادم (قبل أي توجيه)
    const rl = rateLimitCheck(request, clientIp(request));
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    // 1) واجهة الإدارة البرمجية
    if (pathname.startsWith('/api/v1/admin/')) {
      const res = await routeAdminApi(request, env);
      return res ?? json404();
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
    if (pathname === '/researcher' || pathname.startsWith('/researcher/')) {
      const user = await getSessionUser(request, env);
      if (!user) {
        return Response.redirect(new URL('/admin/login', request.url).toString(), 302);
      }
      return renderResearcher(pathname, request, env, user);
    }

    // 4) صفحات الزوار العامة
    return renderPublic(pathname, request, env);
  },
};
