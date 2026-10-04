/* SIDJIL TranslateAction: one small action shared by text blocks and PDF viewers. */
(function () {
  'use strict';
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lang = document.documentElement.lang || 'ar';
  const labels = lang === 'fr' ? { from:'De', to:'Vers', auto:'Détection automatique', translate:'Traduire le livre', textTranslate:'Traduire le texte', close:'Fermer', working:'Traduction du livre…', ready:'Traduction complète', error:'La traduction est temporairement indisponible.', output:'Traduction', mode:'Format', translated:'PDF traduit', bilingual:'PDF bilingue', text:'Texte traduit', ocr:'OCR', autoOcr:'Automatique', advanced:'Avancé', off:'Désactivé', start:'Démarrer la traduction', download:'Télécharger' } : { from:'من', to:'إلى', auto:'اكتشاف تلقائي', translate:'ترجمة الكتاب كاملًا', textTranslate:'ترجمة النص', close:'إغلاق', working:'جارٍ ترجمة الكتاب كاملًا…', ready:'اكتملت ترجمة الكتاب', error:'تعذر تنفيذ الترجمة الآن. حاول مرة أخرى لاحقًا.', output:'الترجمة', mode:'صيغة الإخراج', translated:'PDF مترجم', bilingual:'PDF ثنائي اللغة', text:'نص مترجم', ocr:'OCR', autoOcr:'تلقائي', advanced:'متقدم', off:'معطل', start:'ابدأ ترجمة الكتاب', download:'تنزيل' };
  const modal = (html) => { let el = document.getElementById('translationActionModal'); if (!el) { el = document.createElement('div'); el.id = 'translationActionModal'; el.className = 'translation-action-modal'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); } el.innerHTML = `<div class="translation-action-backdrop" data-translation-close></div><div class="translation-action-card">${html}</div>`; el.classList.add('is-open'); return el; };
  const close = () => {
    const el = document.getElementById('translationActionModal');
    if (el) el.classList.remove('is-open');
    if (typeof window.__sidjilTranslationWorkspaceCleanup === 'function') {
      window.__sidjilTranslationWorkspaceCleanup();
      window.__sidjilTranslationWorkspaceCleanup = null;
    }
    document.body.classList.remove('translation-workspace-open');
  };
  const langs = (source) => `<option value="auto"${source === 'auto' ? ' selected' : ''}>${labels.auto}</option><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option>`;
  async function textAction(btn) {
    const selector = btn.dataset.translateSelector || '[data-translation-source]';
    const nodes = [...document.querySelectorAll(selector)]; const text = nodes.map((x) => x.textContent.trim()).filter(Boolean).join('\n\n');
    if (!text) { const s = btn.parentElement.querySelector('[data-translate-status]'); if (s) s.textContent = labels.error; return; }
    const el = modal(`<button class="translation-action-close" type="button" data-translation-close>×</button><h2>${labels.textTranslate}</h2><div class="translation-action-grid"><label>${labels.from}<select id="taSource">${langs('auto')}</select></label><label>${labels.to}<select id="taTarget"><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label></div><button class="btn btn-primary" id="taSubmit">${labels.textTranslate}</button><p class="translate-inline-status" id="taStatus"></p><div class="translation-action-result hidden" id="taResult"><h3>${labels.output}</h3><div class="text-block" dir="auto" id="taOutput"></div><div class="content-translate-actions"><button class="btn btn-small" type="button" id="taCopy">${lang === 'fr' ? 'Copier' : 'نسخ الترجمة'}</button><button class="btn btn-small btn-ghost" type="button" id="taDownload">${labels.download}</button></div></div>`);
    el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close));
    el.querySelector('#taSubmit').addEventListener('click', async () => { const status = el.querySelector('#taStatus'); const result = el.querySelector('#taResult'); const output = el.querySelector('#taOutput'); const target = el.querySelector('#taTarget').value; status.textContent = labels.working; try { const r = await fetch('/api/v1/translate/text', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ text, source:el.querySelector('#taSource').value, target }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || labels.error); output.textContent = d.translatedText; output.setAttribute('dir', target === 'ar' ? 'rtl' : 'ltr'); output.setAttribute('lang', target); output.classList.toggle('translation-output-rtl', target === 'ar'); result.classList.remove('hidden'); status.textContent = labels.ready; el.querySelector('#taCopy').onclick = () => navigator.clipboard?.writeText(d.translatedText); el.querySelector('#taDownload').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([d.translatedText], {type:'text/plain;charset=utf-8'})); a.download = 'sidjil-translation.txt'; a.click(); }; } catch (e) { status.textContent = e.message || labels.error; } });
  }
  async function documentAction(btn) {
    const material = btn.dataset.translateDocument;
    const pdf = btn.dataset.translatePdf || document.querySelector('#pdfViewerBox')?.dataset.translatePdf || '';
    const title = btn.dataset.translateTitle || document.querySelector('#pdfViewerBox')?.dataset.translateTitle || '';
    const originalDownload = btn.dataset.translateOriginalDownload || document.querySelector('#pdfViewerBox')?.dataset.translateOriginalDownload || pdf;
    if (!pdf) { const el = modal(`<h2>${labels.translate}</h2><p class="translate-inline-status">${labels.error}</p>`); el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close)); return; }
    const el = modal(`<div class="translation-workspace" data-translation-workspace dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
      <header class="translation-workspace-head">
        <div class="translation-workspace-heading"><span class="translation-workspace-kicker">${labels.translate}</span><h2>${esc(title || labels.translate)}</h2><span class="translation-workspace-page" data-ta-page-status></span></div>
        <div class="translation-workspace-actions">
          <label class="translation-language"><span>${labels.from}</span><select data-ta-source>${langs('auto')}</select></label>
          <span class="translation-arrow" aria-hidden="true">→</span>
          <label class="translation-language"><span>${labels.to}</span><select data-ta-target><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>
          <a class="btn btn-small btn-ghost" data-ta-download-original href="${esc(originalDownload)}">${labels.download} ${lang === 'fr' ? 'original' : 'الأصل'}</a>
          <button class="btn btn-small" type="button" data-ta-download-translation disabled>${lang === 'fr' ? 'Télécharger le livre traduit' : 'تنزيل الكتاب المترجم'}</button>
          <button class="btn btn-small btn-primary" type="button" data-ta-create-pdf>${labels.translate}</button>
          <button class="translation-action-close" type="button" data-translation-close aria-label="${labels.close}">×</button>
        </div>
      </header>
      <div class="translation-progress-wrap" aria-live="polite"><div class="translation-progress-track"><div class="translation-progress-bar" data-ta-progress></div></div><span class="translation-progress-label" data-ta-progress-label>0%</span></div>
      <div class="translation-workspace-panels">
        <section class="translation-pane translation-pane-original"><div class="translation-pane-head"><strong>${lang === 'fr' ? 'Fichier original' : 'الملف الأصلي'}</strong><span>${lang === 'fr' ? 'Défilement synchronisé' : 'التمرير متزامن'}</span></div><div class="translation-pane-scroll" data-ta-original-scroll></div></section>
        <section class="translation-pane translation-pane-result"><div class="translation-pane-head"><strong>${lang === 'fr' ? 'Traduction en direct' : 'الترجمة الحية'}</strong><span data-ta-target-label>العربية</span></div><div class="translation-pane-scroll" data-ta-translated-scroll></div></section>
      </div>
      <footer class="translation-workspace-status" data-ta-status aria-live="polite">${lang === 'fr' ? 'Le livre sera traduit en arrière-plan, page par page.' : 'ستتم ترجمة الكتاب كاملًا في الخلفية صفحةً صفحة.'}</footer>
    </div>`);
    el.querySelector('.translation-action-card')?.classList.add('translation-workspace-card');
    document.body.classList.add('translation-workspace-open');
    el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close));
    try {
      const mod = await import('/js/pdf-translation-workspace.js?v=20261004-pdf-rtl-canvas');
      const workspace = mod.mountTranslationWorkspace(el.querySelector('[data-translation-workspace]'), { pdf, material, language: lang, labels, title, originalDownload, target: el.querySelector('[data-ta-target]')?.value || 'ar' });
      el.querySelector('[data-ta-create-pdf]')?.addEventListener('click', () => workspace.createPdf());
      el.querySelector('[data-ta-download-translation]')?.addEventListener('click', () => workspace.downloadTranslation());
    } catch (e) {
      const status = el.querySelector('[data-ta-status]');
      if (status) status.textContent = labels.error;
      console.error('translation workspace failed', e);
    }
  }
  async function poll(jobId, status, el) { for (let i = 0; i < 180; i++) { await new Promise((r) => setTimeout(r, 2000)); try { const r = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(jobId)}`); const d = await r.json(); const j = d.job || {}; status.textContent = j.status === 'COMPLETED' ? labels.ready : j.status === 'FAILED' ? (j.error_message || labels.error) : `${labels.working} (${j.progress || 0}%)`; if (j.status === 'COMPLETED') { status.innerHTML = `${labels.ready} · <a href="/api/v1/translate/jobs/${encodeURIComponent(jobId)}/download">${labels.download}</a>`; return; } if (j.status === 'FAILED') return; } catch (_) {} } }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-translate-text]'); if (t) { e.preventDefault(); textAction(t); return; } const d = e.target.closest('[data-translate-document]'); if (d) { e.preventDefault(); documentAction(d); } });
})();
