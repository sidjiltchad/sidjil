/* SIDJIL — live homepage search (three characters minimum) */
(() => {
  const form = document.querySelector('[data-live-search-form]');
  if (!form) return;
  const input = form.querySelector('[data-live-search-input]');
  const region = document.querySelector('[data-live-search-results]');
  const status = document.querySelector('[data-live-search-status]');
  const list = document.querySelector('[data-live-search-list]');
  const more = document.querySelector('[data-live-search-more]');
  if (!input || !region || !status || !list) return;

  const lang = (document.documentElement.lang || form.querySelector('[name="lang"]')?.value || 'ar') === 'fr' ? 'fr' : 'ar';
  const isFrench = lang === 'fr';
  const labels = isFrench
    ? { searching: 'Recherche…', empty: 'Aucun résultat trouvé.', error: 'La recherche est momentanément indisponible.', results: 'résultats', more: 'Voir tous les résultats' }
    : { searching: 'جارٍ البحث…', empty: 'لا توجد نتائج مطابقة.', error: 'تعذر تنفيذ البحث الآن. حاول مرة أخرى.', results: 'نتيجة', more: 'عرض كل النتائج' };
  const typeLabels = isFrench
    ? { document: 'Document', book: 'Livre', image: 'Image', manuscript: 'Manuscrit', map: 'Carte', press: 'Presse', article: 'Article', journal: 'Revue' }
    : { document: 'وثيقة', book: 'كتاب', image: 'صورة', manuscript: 'مخطوط', map: 'خريطة', press: 'صحافة', article: 'مقال', journal: 'مجلة' };
  let timer = null;
  let controller = null;

  const escapeText = (value) => String(value ?? '');
  const markQuery = (value, query) => {
    const text = escapeText(value);
    const tokens = escapeText(query).trim().split(/\s+/u).filter(Boolean).slice(0, 8);
    if (!tokens.length) return document.createTextNode(text);
    const pattern = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of text.matchAll(new RegExp(pattern, 'giu'))) {
      if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const el = document.createElement('mark');
      el.textContent = match[0];
      fragment.append(el);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    return fragment;
  };

  const clear = () => {
    list.replaceChildren();
    status.textContent = '';
    region.hidden = true;
    region.setAttribute('aria-busy', 'false');
  };

  const render = (items, query) => {
    list.replaceChildren();
    if (!items.length) {
      status.textContent = labels.empty;
      region.hidden = false;
      return;
    }
    status.textContent = `${items.length} ${labels.results}`;
    for (const item of items) {
      const link = document.createElement('a');
      link.className = 'home-live-search-item';
      link.href = `/document/${encodeURIComponent(item.ark)}?lang=${lang}`;
      const body = document.createElement('span');
      body.className = 'home-live-search-item-body';
      const type = document.createElement('span');
      type.className = 'home-live-search-item-type';
      type.textContent = typeLabels[item.type] || (isFrench ? 'Archive' : 'أرشيف');
      const title = document.createElement('strong');
      title.className = 'home-live-search-item-title';
      title.append(markQuery(item.title || item.title_ar || item.title_orig || item.ark, query));
      const snippetText = item.snippet || (isFrench ? item.summary_fr : item.summary) || (isFrench ? item.description_fr : item.description) || '';
      body.append(type, title);
      if (snippetText) {
        const snippet = document.createElement('span');
        snippet.className = 'home-live-search-item-snippet';
        snippet.append(markQuery(snippetText.replace(/<mark>|<\/mark>/g, ''), query));
        body.append(snippet);
      }
      const meta = document.createElement('span');
      meta.className = 'home-live-search-item-meta';
      const place = item.place_name_localized || '';
      const source = item.source_name_localized || '';
      meta.textContent = [item.year, place, source].filter(Boolean).join(' · ');
      link.append(body, meta);
      list.append(link);
    }
    region.hidden = false;
    if (more) {
      const url = new URL(more.href, window.location.origin);
      url.searchParams.set('q', query);
      url.searchParams.set('lang', lang);
      more.href = url.pathname + url.search;
      more.textContent = `${labels.more} →`;
    }
  };

  const run = async (query) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      if (controller) controller.abort();
      clear();
      return;
    }
    if (controller) controller.abort();
    controller = new AbortController();
    region.hidden = false;
    region.setAttribute('aria-busy', 'true');
    status.textContent = labels.searching;
    list.replaceChildren();
    try {
      const url = `/api/v1/search?q=${encodeURIComponent(trimmed)}&lang=${lang}&perPage=8&count=0`;
      const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      render(Array.isArray(payload.items) ? payload.items : [], trimmed);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      status.textContent = labels.error;
      region.hidden = false;
    } finally {
      region.setAttribute('aria-busy', 'false');
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 220);
  });
  form.addEventListener('submit', () => {
    if (input.value.trim().length < 3) input.focus();
  });
})();
