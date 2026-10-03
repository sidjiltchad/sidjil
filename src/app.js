// ============================================================
// SIDJIL — موجّه نطاق التطبيق: app.sidjil.org
// مساحة الباحثين (مجلس سِجِل) كتطبيق مستقل:
//  - الجذر "/" يفتح صفحة تسجيل الدخول مباشرة
//  - أي مسار خارج التطبيق يُعاد إلى الجذر
//  - باقي المسارات تكمل التوجيه العادي (تُرجع null)
// ============================================================

import { getSessionUser } from './lib/auth.js';
import { appLoginPage } from './app-views.js';

export const APP_HOST = 'app.sidjil.org';

export function isAppHost(hostname) {
  return hostname === APP_HOST;
}

function htmlRes(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// مسارات التطبيق المسموحة على النطاق — ما عداها يُعاد إلى "/"
const APP_PREFIXES = ['/researcher', '/discussions', '/discussion', '/api', '/file'];

export async function routeApp(request, env, url) {
  const pathname = url.pathname;

  // الجذر: صفحة تسجيل الدخول مباشرة (ومن لديه جلسة يُوجَّه إلى النقاشات)
  if (pathname === '/' || pathname === '/login') {
    if (request.method !== 'GET') return null;
    const user = await getSessionUser(request, env);
    if (user) {
      return Response.redirect(new URL('/discussions', url).toString(), 302);
    }
    const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar';
    return htmlRes(appLoginPage(lang));
  }

  // مسارات التطبيق تكمل التوجيه العادي
  const allowed = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!allowed) {
    return Response.redirect(new URL('/', url).toString(), 302);
  }
  return null;
}
