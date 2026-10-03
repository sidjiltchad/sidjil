// ============================================================
// SIDJIL — تطبيق مساحة الباحثين (app.sidjil.org)
// صفحة تسجيل دخول مستقلة: بلا ترويسة الموقع ولا تذييله.
// ============================================================

const THEME_INIT = `<script>try{var __st=localStorage.getItem('sidjil-theme');if(__st!=='dark'&&__st!=='light'){__st=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',__st);}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>`;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STR = {
  ar: {
    dir: 'rtl',
    title: 'تسجيل الدخول — مجلس سِجِل',
    brand: 'مجلس سِجِل',
    sub: 'مساحة الباحثين — أرشيف تاريخ تشاد الرقمي',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    submit: 'دخول',
    loginError: 'بيانات الدخول غير صحيحة',
    networkError: 'تعذّر الاتصال — تحقق من الشبكة وحاول مجددًا',
    loading: 'جارٍ تسجيل الدخول…',
    noAccount: 'ليس لديك حساب باحث؟',
    register: 'أنشئ حسابًا',
    backToSite: 'العودة إلى الموقع الرئيسي',
    sessionNote: 'الجلسة صالحة لمدة 12 ساعة.',
    langName: 'FR',
    langHref: '/?lang=fr',
    langLabel: 'التبديل إلى الفرنسية',
  },
  fr: {
    dir: 'ltr',
    title: 'Connexion — Majlis SIDJIL',
    brand: 'Majlis SIDJIL',
    sub: 'Espace chercheurs — Archives historiques du Tchad',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    submit: 'Se connecter',
    loginError: 'Identifiants incorrects',
    networkError: 'Connexion impossible — vérifiez le réseau',
    loading: 'Connexion en cours…',
    noAccount: 'Pas encore de compte chercheur ?',
    register: 'Créer un compte',
    backToSite: 'Retour au site principal',
    sessionNote: 'Session valable 12 heures.',
    langName: 'ع',
    langHref: '/?lang=ar',
    langLabel: 'Passer à l’arabe',
  },
};

/**
 * صفحة تسجيل دخول التطبيق — مستند كامل مستقل بلا أي كروم من الموقع.
 * @param {'ar'|'fr'} lang
 */
export function appLoginPage(lang = 'ar') {
  const L = STR[lang] || STR.ar;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${L.dir}">
<head>
<meta charset="utf-8">
${THEME_INIT}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.title)}</title>
<meta name="description" content="${esc(L.sub)}">
<meta name="theme-color" content="#1f4276">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${esc(L.brand)}">
<link rel="icon" href="/logo.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="manifest" href="/app-manifest.json">
<link rel="stylesheet" href="/admin.css">
</head>
<body class="login-body">
<div class="login-card app-login-card">
  <div class="app-login-lang"><a href="${L.langHref}" aria-label="${esc(L.langLabel)}">${esc(L.langName)}</a></div>
  <img class="app-login-logo" src="/logo.png" alt="سِجِل" width="72" height="72">
  <div class="brand-name big">${esc(L.brand)}</div>
  <div class="brand-sub">${esc(L.sub)}</div>
  <div class="app-login-error" id="loginError" role="alert" hidden></div>
  <form id="appLoginForm" autocomplete="off">
    <div class="field">
      <label for="username">${esc(L.username)}</label>
      <input id="username" name="username" type="text" required autofocus autocomplete="username">
    </div>
    <div class="field">
      <label for="password">${esc(L.password)}</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
    </div>
    <button class="btn btn-primary btn-block" id="loginBtn" type="submit">${esc(L.submit)}</button>
  </form>
  <p class="app-login-alt">${esc(L.noAccount)} <a href="/researcher/register${lang === 'fr' ? '?lang=fr' : ''}">${esc(L.register)}</a></p>
  <p class="muted small">${esc(L.sessionNote)}</p>
  <p class="app-login-back"><a href="https://sidjil.org">${esc(L.backToSite)}</a></p>
</div>
<script>
(function () {
  var STR = ${JSON.stringify({ loginError: STR.ar.loginError, networkError: STR.ar.networkError, loading: STR.ar.loading, loginErrorFr: STR.fr.loginError, networkErrorFr: STR.fr.networkError, loadingFr: STR.fr.loading })};
  var lang = document.documentElement.lang === 'fr' ? 'fr' : 'ar';
  var form = document.getElementById('appLoginForm');
  var btn = document.getElementById('loginBtn');
  var errBox = document.getElementById('loginError');
  function t(k) { return STR[k + (lang === 'fr' ? 'Fr' : '')]; }
  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('loading');
    try {
      var res = await fetch('/api/v1/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: form.username.value.trim(),
          password: form.password.value
        })
      });
      var data = null;
      try { data = await res.json(); } catch (_) { /* تجاهل */ }
      if (!res.ok || !data || !data.ok) {
        showError((data && data.error) || t('loginError'));
        return;
      }
      try { if (data.csrfToken) sessionStorage.setItem('csrfToken', data.csrfToken); } catch (_) { /* تجاهل */ }
      location.href = (data.user && data.user.role === 'admin') ? 'https://sidjil.org/admin' : '/discussions';
    } catch (_) {
      showError(t('networkError'));
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
})();
</script>
</body>
</html>`;
}
