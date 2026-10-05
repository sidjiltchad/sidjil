/* طلب ترجمة عام للمواد النصية التي لا تملك عارض PDF. */
(function () {
  'use strict';
  var buttons = document.querySelectorAll('[data-request-translation-standalone]');
  if (!buttons.length) return;
  var pageLang = (document.documentElement.getAttribute('lang') || 'ar').toLowerCase().startsWith('fr') ? 'fr' : 'ar';
  buttons.forEach(function (button) {
    var form = document.createElement('form');
    form.className = 'translation-request-form';
    form.hidden = true;
    form.innerHTML = pageLang === 'fr'
      ? '<p class="translation-request-intro">Laissez vos coordonnées pour être informé lorsque la traduction sera disponible.</p><label><span>Nom du demandeur</span><input name="requester_name" required maxlength="120" autocomplete="name"></label><label><span>E-mail</span><input name="requester_email" required type="email" maxlength="160" autocomplete="email"></label><button class="btn btn-primary" type="submit">Envoyer la demande</button><p class="translation-request-status" aria-live="polite"></p>'
      : '<p class="translation-request-intro">اكتب بياناتك لتتمكن الإدارة من متابعة طلب الترجمة معك.</p><label><span>اسم طالب الترجمة</span><input name="requester_name" required maxlength="120" autocomplete="name"></label><label><span>البريد الإلكتروني</span><input name="requester_email" required type="email" maxlength="160" autocomplete="email"></label><button class="btn btn-primary" type="submit">إرسال الطلب</button><p class="translation-request-status" aria-live="polite"></p>';
    button.insertAdjacentElement('afterend', form);
    button.addEventListener('click', function () {
      if (button.disabled) return;
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input')?.focus();
    });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      var status = form.querySelector('.translation-request-status');
      submit.disabled = true;
      status.textContent = pageLang === 'fr' ? 'Envoi…' : 'جارٍ الإرسال…';
      try {
        var response = await fetch('/api/v1/translation-requests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            material_id: Number(button.getAttribute('data-material-id')),
            source_file_id: null,
            requester_name: form.elements.requester_name.value.trim(),
            requester_email: form.elements.requester_email.value.trim(),
          }),
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || '');
        button.disabled = true;
        button.textContent = pageLang === 'fr' ? 'Demande envoyée ✓' : 'تم إرسال طلب الترجمة ✓';
        status.textContent = payload.duplicate
          ? (pageLang === 'fr' ? 'Votre demande est déjà enregistrée.' : 'طلبك مسجل لدينا بالفعل.')
          : (pageLang === 'fr' ? 'Nous vous contacterons lorsque la traduction sera disponible.' : 'ستتواصل الإدارة معك عند توفر الترجمة.');
        submit.hidden = true;
      } catch (error) {
        submit.disabled = false;
        status.textContent = error.message || (pageLang === 'fr' ? 'Envoi impossible.' : 'تعذّر إرسال الطلب.');
      }
    });
  });
})();
