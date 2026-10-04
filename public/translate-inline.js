/* SIDJIL TranslateAction: one small action shared by text blocks and PDF viewers. */
(function () {
  'use strict';
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || sessionStorage.getItem('csrfToken') || '';
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
  async function textAction(btn, selectedText) {
    const selector = btn.dataset.translateSelector || '[data-translation-source]';
    const nodes = [...document.querySelectorAll(selector)]; const text = String(selectedText || nodes.map((x) => x.textContent.trim()).filter(Boolean).join('\n\n')).trim();
    if (!text) { const s = btn.parentElement.querySelector('[data-translate-status]'); if (s) s.textContent = labels.error; return; }
    const el = modal(`<button class="translation-action-close" type="button" data-translation-close>×</button><h2>${labels.textTranslate}</h2><div class="translation-action-grid"><label>${labels.from}<select id="taSource">${langs('auto')}</select></label><label>${labels.to}<select id="taTarget"><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label></div><button class="btn btn-primary" id="taSubmit">${labels.textTranslate}</button><p class="translate-inline-status" id="taStatus"></p><div class="translation-action-result hidden" id="taResult"><h3>${labels.output}</h3><div class="text-block" dir="auto" id="taOutput"></div><div class="content-translate-actions"><button class="btn btn-small" type="button" id="taCopy">${lang === 'fr' ? 'Copier' : 'نسخ الترجمة'}</button><button class="btn btn-small btn-ghost" type="button" id="taDownload">${labels.download}</button></div></div>`);
    el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close));
    el.querySelector('#taSubmit').addEventListener('click', async () => { const status = el.querySelector('#taStatus'); const result = el.querySelector('#taResult'); const output = el.querySelector('#taOutput'); const target = el.querySelector('#taTarget').value; status.textContent = labels.working; try { const token = csrf(); const headers = {'content-type':'application/json'}; if (token) headers['X-CSRF-Token'] = token; const r = await fetch('/api/v1/translate/text', { method:'POST', headers, credentials:'same-origin', body:JSON.stringify({ text, source:el.querySelector('#taSource').value, target }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || labels.error); output.textContent = d.translatedText; output.setAttribute('dir', target === 'ar' ? 'rtl' : 'ltr'); output.setAttribute('lang', target); output.classList.toggle('translation-output-rtl', target === 'ar'); result.classList.remove('hidden'); status.textContent = labels.ready; el.querySelector('#taCopy').onclick = () => navigator.clipboard?.writeText(d.translatedText); el.querySelector('#taDownload').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([d.translatedText], {type:'text/plain;charset=utf-8'})); a.download = 'sidjil-translation.txt'; a.click(); }; } catch (e) { status.textContent = e.message || labels.error; } });
  }
  window.SidjilTranslateSelection = (text) => textAction({ dataset: {} }, text);
  async function documentAction(btn) {
    const material = btn.dataset.translateDocument;
    const pdf = btn.dataset.translatePdf || document.querySelector('#pdfViewerBox')?.dataset.translatePdf || '';
    const title = btn.dataset.translateTitle || document.querySelector('#pdfViewerBox')?.dataset.translateTitle || '';
    const originalDownload = btn.dataset.translateOriginalDownload || document.querySelector('#pdfViewerBox')?.dataset.translateOriginalDownload || pdf;
    if (!pdf) { const el = modal(`<h2>${labels.translate}</h2><p class="translate-inline-status">${labels.error}</p>`); el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close)); return; }
    const el = modal(`<div class="translation-workspace" data-translation-workspace aria-label="${esc(title || labels.translate)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
      <header class="translation-workspace-head">
        <button class="translation-workspace-close" type="button" data-translation-close data-translation-drag-close aria-label="${labels.close}" title="${labels.close}"><span class="translation-close-grip" aria-hidden="true"></span><span class="sr-only">${labels.close}</span></button>
        <div class="translation-workspace-actions">
          <div class="translation-language-controls">
            <label class="translation-language"><span>${labels.from}</span><select data-ta-source>${langs('auto')}</select></label>
            <span class="translation-arrow" aria-hidden="true">→</span>
            <label class="translation-language"><span>${labels.to}</span><select data-ta-target><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>
          </div>
          <div class="translation-icon-actions" role="toolbar" aria-label="${lang === 'fr' ? 'Actions du lecteur' : 'إجراءات القارئ'}">
            <a class="translation-icon-action" data-ta-download-original href="${esc(originalDownload)}" aria-label="${lang === 'fr' ? 'Télécharger l’original' : 'تنزيل الأصل'}" title="${lang === 'fr' ? 'Télécharger l’original' : 'تنزيل الأصل'}"><span class="translation-icon translation-icon-download" aria-hidden="true">↓</span><span class="sr-only">${lang === 'fr' ? 'Original' : 'الأصل'}</span></a>
            <button class="translation-icon-action translation-icon-action-primary" type="button" data-ta-start-translation aria-label="${labels.translate}" title="${labels.translate}"><span class="translation-icon" aria-hidden="true">✦</span><span class="sr-only">${labels.translate}</span></button>
            <button class="translation-icon-action" type="button" data-ta-download-translation aria-label="${lang === 'fr' ? 'Télécharger le texte traduit' : 'تنزيل النص المترجم'}" title="${lang === 'fr' ? 'Télécharger le texte traduit' : 'تنزيل النص المترجم'}" disabled><span class="translation-icon" aria-hidden="true">T↓</span><span class="sr-only">${lang === 'fr' ? 'Texte traduit' : 'النص المترجم'}</span></button>
            <button class="translation-icon-action" type="button" data-ta-create-pdf aria-label="${lang === 'fr' ? 'Exporter en PDF' : 'تصدير PDF'}" title="${lang === 'fr' ? 'Exporter en PDF' : 'تصدير PDF'}" disabled><span class="translation-icon translation-icon-pdf" aria-hidden="true">PDF</span><span class="sr-only">PDF</span></button>
          </div>
        </div>
      </header>
      <div class="translation-progress-wrap" aria-live="polite"><div class="translation-progress-track"><div class="translation-progress-bar" data-ta-progress></div></div><span class="translation-progress-label" data-ta-progress-label>0%</span></div>
      <div class="translation-workspace-mobile-tabs" role="tablist" aria-label="${lang === 'fr' ? 'Panneau de lecture' : 'لوحة القراءة'}">
        <button type="button" role="tab" data-ta-mobile-tab="original" aria-controls="taOriginalPane" aria-selected="true">${lang === 'fr' ? 'Original' : 'الأصل'}</button>
        <button type="button" role="tab" data-ta-mobile-tab="translated" aria-controls="taTranslatedPane" aria-selected="false">${lang === 'fr' ? 'Traduction' : 'الترجمة'}</button>
      </div>
      <div class="translation-workspace-panels">
        <section class="translation-pane translation-pane-original is-mobile-active" id="taOriginalPane" role="tabpanel"><div class="translation-pane-head"><strong>${lang === 'fr' ? 'Fichier original' : 'الملف الأصلي'}</strong><span>${lang === 'fr' ? 'Défilement synchronisé' : 'التمرير متزامن'}</span></div><div class="translation-pane-scroll" data-ta-original-scroll></div></section>
        <section class="translation-pane translation-pane-result" id="taTranslatedPane" role="tabpanel"><div class="translation-pane-head"><strong>${lang === 'fr' ? 'Traduction en direct' : 'الترجمة الحية'}</strong><span data-ta-target-label>العربية</span></div><div class="translation-pane-scroll" data-ta-translated-scroll></div></section>
      </div>
      <footer class="translation-workspace-status" data-ta-status aria-live="polite">${lang === 'fr' ? 'Lisez le fichier original ou lancez la traduction quand vous le souhaitez.' : 'يمكنك قراءة الملف الأصلي، أو بدء الترجمة عند الحاجة.'}</footer>
    </div>`);
    el.classList.add('translation-workspace-modal');
    el.querySelector('.translation-action-card')?.classList.add('translation-workspace-card');
    document.body.classList.add('translation-workspace-open');
    el.querySelectorAll('[data-translation-close]').forEach((x) => x.addEventListener('click', close));
    const closeHandle = el.querySelector('[data-translation-drag-close]');
    if (closeHandle) {
      let startY = 0;
      let dragging = false;
      closeHandle.addEventListener('pointerdown', (event) => {
        startY = event.clientY;
        dragging = true;
        closeHandle.setPointerCapture?.(event.pointerId);
        el.querySelector('.translation-workspace-card')?.classList.add('is-dragging');
      });
      closeHandle.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const delta = Math.max(0, event.clientY - startY);
        el.querySelector('.translation-workspace-card')?.style.setProperty('--reader-drag-offset', `${delta}px`);
      });
      const finishDrag = (event) => {
        if (!dragging) return;
        dragging = false;
        const delta = Math.max(0, event.clientY - startY);
        const card = el.querySelector('.translation-workspace-card');
        card?.classList.remove('is-dragging');
        card?.style.removeProperty('--reader-drag-offset');
        if (delta > 72) close();
      };
      closeHandle.addEventListener('pointerup', finishDrag);
      closeHandle.addEventListener('pointercancel', finishDrag);
    }
    const mobileTabs = [...el.querySelectorAll('[data-ta-mobile-tab]')];
    mobileTabs.forEach((tab) => tab.addEventListener('click', () => {
      const selected = tab.dataset.taMobileTab;
      mobileTabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
      el.querySelector('.translation-pane-original')?.classList.toggle('is-mobile-active', selected === 'original');
      el.querySelector('.translation-pane-result')?.classList.toggle('is-mobile-active', selected === 'translated');
    }));
    try {
      const mod = await import('/js/pdf-translation-workspace.js?v=20261004-reader-flow-v1');
      const workspace = mod.mountTranslationWorkspace(el.querySelector('[data-translation-workspace]'), { pdf, material, language: lang, labels, title, originalDownload, target: el.querySelector('[data-ta-target]')?.value || 'ar' });
      el.querySelector('[data-ta-start-translation]')?.addEventListener('click', () => workspace.startBookTranslation());
      el.querySelector('[data-ta-create-pdf]')?.addEventListener('click', () => workspace.exportPdf());
      el.querySelector('[data-ta-download-translation]')?.addEventListener('click', () => workspace.downloadTranslation());
    } catch (e) {
      const status = el.querySelector('[data-ta-status]');
      if (status) status.textContent = labels.error;
      console.error('translation workspace failed', e);
    }
  }
  window.SidjilOpenDocumentReader = (data = {}) => documentAction({ dataset: {
    translateDocument: data.material || '',
    translatePdf: data.pdf || '',
    translateTitle: data.title || '',
    translateOriginalDownload: data.originalDownload || data.pdf || '',
  } });
  async function poll(jobId, status, el) { for (let i = 0; i < 180; i++) { await new Promise((r) => setTimeout(r, 2000)); try { const r = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(jobId)}`); const d = await r.json(); const j = d.job || {}; status.textContent = j.status === 'COMPLETED' ? labels.ready : j.status === 'FAILED' ? (j.error_message || labels.error) : `${labels.working} (${j.progress || 0}%)`; if (j.status === 'COMPLETED') { status.innerHTML = `${labels.ready} · <a href="/api/v1/translate/jobs/${encodeURIComponent(jobId)}/download">${labels.download}</a>`; return; } if (j.status === 'FAILED') return; } catch (_) {} } }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-translate-text]'); if (t) { e.preventDefault(); textAction(t); return; } const d = e.target.closest('[data-translate-document]'); if (d) { e.preventDefault(); documentAction(d); } });
})();
