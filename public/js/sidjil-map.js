/* ============================================================
   SIDJIL — خريطة سِجِل التفاعلية
   SVG خالص بدون مكتبات: مضلعات الأقاليم من chad-provinces.geojson
   + تسميات عربية وفرنسية + نقاط الأحداث + تلميحات + فلاتر
   ============================================================ */
(function () {
  'use strict';

  // الأسماء العربية للأقاليم (مطابقة لـ src/lib/chad-map.js)
  var PROVINCE_AR = {
    TD01: 'البطحة', TD02: 'بوركو', TD03: 'شاري باقرمي', TD04: 'قيرا',
    TD05: 'حجر لميس', TD06: 'كانم', TD07: 'البحيرة', TD08: 'لوقون الغربي',
    TD09: 'لوقون الشرقي', TD10: 'ماندول', TD11: 'مايو كيبي الشرقية',
    TD12: 'مايو كيبي الغربية', TD13: 'شاري الأوسط', TD14: 'وداي',
    TD15: 'سلامات', TD16: 'تانجلي', TD17: 'وادي فيرا', TD18: 'نجامينا',
    TD19: 'بحر الغزال', TD20: 'إنيدي الشرقية', TD21: 'سيلا',
    TD22: 'تيبستي', TD23: 'إنيدي الغربية'
  };

  // إزاحة تسمية الأقاليم الصغيرة جدًا (نجامينا) خارج المضلع
  var LABEL_OFFSET = { TD18: { dx: 30, dy: -22 } };

  var NS = 'http://www.w3.org/2000/svg';
  var GEO_URL = '/data/chad-provinces.geojson';
  var API_URL = '/api/v1/map-points';

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initOne(root) {
    if (!root || root.dataset.mapInit) return;
    root.dataset.mapInit = '1';

    var lang = root.dataset.lang === 'fr' ? 'fr' : 'ar';
    var langq = root.dataset.langq || '?lang=ar';
    var S = function (k) { return root.dataset['str' + k] || ''; };

    root.innerHTML =
      '<div class="smap-loading" role="status">' + esc(S('Loading')) + '</div>';

    Promise.all([
      fetch(GEO_URL).then(function (r) { if (!r.ok) throw new Error('geo'); return r.json(); }),
      fetch(API_URL).then(function (r) { if (!r.ok) throw new Error('api'); return r.json(); })
    ]).then(function (res) {
      build(root, res[0], res[1] && res[1].places ? res[1].places : [], lang, langq, S);
    }).catch(function () {
      root.innerHTML = '<div class="smap-error" role="alert">' + esc(S('Error')) + '</div>';
    });
  }

  function projectFactory(features) {
    var minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    features.forEach(function (f) {
      walkCoords(f.geometry, function (lng, lat) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    });
    var meanLat = (minLat + maxLat) / 2 * Math.PI / 180;
    var kx = Math.cos(meanLat);
    var w = (maxLng - minLng) * kx, h = (maxLat - minLat);
    var W = 640, H = 640 * h / w;
    function px(lng, lat) {
      return [
        ((lng - minLng) * kx / w) * W,
        ((maxLat - lat) / h) * H
      ];
    }
    return { px: px, W: W, H: H };
  }

  function walkCoords(geom, cb) {
    if (!geom) return;
    var coords = geom.coordinates;
    if (geom.type === 'Polygon') coords = [coords];
    coords.forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (pt) { cb(pt[0], pt[1]); });
      });
    });
  }

  function ringPath(poly, proj) {
    return poly.map(function (ring) {
      return 'M' + ring.map(function (pt) {
        var p = proj.px(pt[0], pt[1]);
        return p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      }).join('L') + 'Z';
    }).join('');
  }

  function build(root, geo, places, lang, langq, S) {
    var features = (geo.features || []).filter(function (f) {
      return f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
    });
    var proj = projectFactory(features);

    root.innerHTML = '';
    root.classList.add('smap-root');

    // شريط الفلاتر
    var filters = document.createElement('div');
    filters.className = 'smap-filters';
    root.appendChild(filters);

    var regions = [];
    places.forEach(function (p) {
      if (p.region && regions.indexOf(p.region) < 0) regions.push(p.region);
    });
    regions.sort();

    var regionWrap = document.createElement('label');
    regionWrap.className = 'smap-filter';
    var regionSel = document.createElement('select');
    regionSel.className = 'smap-select';
    regionSel.setAttribute('aria-label', S('Region'));
    var optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = S('AllRegions');
    regionSel.appendChild(optAll);
    regions.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r; o.textContent = r;
      regionSel.appendChild(o);
    });
    var regionLab = document.createElement('span');
    regionLab.className = 'smap-filter-label';
    regionLab.textContent = S('Region');
    regionWrap.appendChild(regionLab);
    regionWrap.appendChild(regionSel);
    filters.appendChild(regionWrap);

    var kinds = [['city', S('City')], ['region', S('RegionKind')], ['site', S('Site')]];
    var kindState = { city: true, region: true, site: true };
    var kindWrap = document.createElement('div');
    kindWrap.className = 'smap-kinds';
    kindWrap.setAttribute('role', 'group');
    kindWrap.setAttribute('aria-label', S('Kind'));
    kinds.forEach(function (kk) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'smap-chip is-on';
      b.dataset.kind = kk[0];
      b.setAttribute('aria-pressed', 'true');
      b.innerHTML = '<span class="smap-dot smap-dot-' + kk[0] + '" aria-hidden="true"></span>' + esc(kk[1]);
      b.addEventListener('click', function () {
        kindState[kk[0]] = !kindState[kk[0]];
        b.classList.toggle('is-on', kindState[kk[0]]);
        b.setAttribute('aria-pressed', kindState[kk[0]] ? 'true' : 'false');
        renderPoints();
      });
      kindWrap.appendChild(b);
    });
    filters.appendChild(kindWrap);

    // منطقة الرسم
    var stage = document.createElement('div');
    stage.className = 'smap-stage';
    root.appendChild(stage);

    var svg = el('svg', {
      viewBox: '0 0 ' + proj.W.toFixed(0) + ' ' + proj.H.toFixed(0),
      class: 'smap-svg', role: 'img',
      'aria-label': S('MapLabel')
    }, stage);

    // طبقة الأقاليم
    var gProv = el('g', { class: 'smap-provinces' }, svg);
    features.forEach(function (f) {
      var props = f.properties || {};
      var code = props.adm1_pcode;
      var coords = f.geometry.coordinates;
      var polys = f.geometry.type === 'Polygon' ? [coords] : coords;
      var d = polys.map(function (poly) { return ringPath(poly, proj); }).join('');
      el('path', { d: d, class: 'smap-province', 'data-code': code || '' }, gProv);
    });

    // طبقة التسميات (عربي + فرنسي)
    var gLab = el('g', { class: 'smap-labels' }, svg);
    features.forEach(function (f) {
      var props = f.properties || {};
      var code = props.adm1_pcode;
      if (props.center_lat == null || props.center_lon == null) return;
      var p = proj.px(props.center_lon, props.center_lat);
      var off = LABEL_OFFSET[code] || { dx: 0, dy: 0 };
      var x = p[0] + off.dx, y = p[1] + off.dy;
      var g = el('g', { class: 'smap-label', transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' }, gLab);
      var t1 = el('text', { class: 'smap-label-ar', 'text-anchor': 'middle', y: '-2' }, g);
      t1.textContent = PROVINCE_AR[code] || props.adm1_name || '';
      var t2 = el('text', { class: 'smap-label-fr', 'text-anchor': 'middle', y: '11' }, g);
      t2.textContent = props.adm1_name || '';
      if (off.dx || off.dy) {
        el('circle', { class: 'smap-label-anchor', cx: 0, cy: 0, r: 2 }, g);
        el('line', { class: 'smap-label-leader', x1: 0, y1: 0, x2: -off.dx, y2: -off.dy + 4 }, g);
      }
    });

    // طبقة النقاط
    var gPts = el('g', { class: 'smap-points' }, svg);

    // التلميح
    var tip = document.createElement('div');
    tip.className = 'smap-tip';
    tip.hidden = true;
    stage.appendChild(tip);

    function titleOf(m) {
      if (lang === 'fr') return m.title_orig || m.title_ar || '';
      return m.title_ar || m.title_orig || '';
    }

    function showTip(html, x, y) {
      tip.innerHTML = html;
      tip.hidden = false;
      var st = stage.getBoundingClientRect();
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var lx = x + 14, ly = y - th - 10;
      if (lx + tw > st.width) lx = x - tw - 14;
      if (ly < 0) ly = y + 18;
      tip.style.left = Math.max(4, lx) + 'px';
      tip.style.top = Math.max(4, ly) + 'px';
    }
    function hideTip() { tip.hidden = true; }

    function tipHTML(place, m) {
      var placeName = lang === 'fr'
        ? (place.name_orig || place.name_ar) : (place.name_ar || place.name_orig);
      var date = m.date_text || m.year || '';
      return '<div class="smap-tip-place">' + esc(placeName) + '</div>' +
        '<div class="smap-tip-title">' + esc(titleOf(m)) + '</div>' +
        (date ? '<div class="smap-tip-date">' + esc(date) + '</div>' : '') +
        (m.summary ? '<p class="smap-tip-sum">' + esc(m.summary) + '</p>' : '') +
        '<a class="smap-tip-link" href="/document/' + encodeURIComponent(m.ark) + langq + '">' +
        esc(S('ViewMaterial')) + ' ←</a>';
    }

    function renderPoints() {
      while (gPts.firstChild) gPts.removeChild(gPts.firstChild);
      var regionF = regionSel.value;
      var visible = places.filter(function (p) {
        return kindState[p.kind || 'city'] !== false &&
          (!regionF || p.region === regionF) &&
          p.materials && p.materials.length;
      });
      var n = 0;
      visible.forEach(function (p) {
        var c = proj.px(p.lng, p.lat);
        var mats = p.materials;
        mats.forEach(function (m, i) {
          var ang = (mats.length > 1) ? (i / mats.length) * Math.PI * 2 - Math.PI / 2 : 0;
          var rad = (mats.length > 1) ? 17 : 0;
          var x = c[0] + Math.cos(ang) * rad;
          var y = c[1] + Math.sin(ang) * rad;
          var kind = p.kind || 'city';
          var g = el('g', {
            class: 'smap-pt smap-pt-' + kind,
            transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')',
            tabindex: '0', role: 'button',
            'aria-label': titleOf(m)
          }, gPts);
          if (kind === 'city') {
            el('circle', { class: 'smap-ring', r: 11 }, g);
            el('circle', { class: 'smap-dotc', r: 5.5 }, g);
          } else if (kind === 'region') {
            el('circle', { class: 'smap-dotc', r: 7 }, g);
          } else {
            el('rect', { class: 'smap-dotc', x: -6, y: -6, width: 12, height: 12, rx: 2 }, g);
          }
          var html = tipHTML(p, m);
          g.addEventListener('mouseenter', function (e) {
            var r = stage.getBoundingClientRect();
            showTip(html, e.clientX - r.left, e.clientY - r.top);
          });
          g.addEventListener('mousemove', function (e) {
            if (tip.hidden) return;
            var r = stage.getBoundingClientRect();
            showTip(html, e.clientX - r.left, e.clientY - r.top);
          });
          g.addEventListener('mouseleave', hideTip);
          g.addEventListener('focus', function () {
            var r = stage.getBoundingClientRect();
            var pt = svg.createSVGPoint();
            pt.x = x; pt.y = y;
            var sp = pt.matrixTransform(svg.getScreenCTM());
            showTip(html, sp.x - r.left, sp.y - r.top);
          });
          g.addEventListener('blur', hideTip);
          g.addEventListener('click', function () {
            window.location.href = '/document/' + encodeURIComponent(m.ark) + langq;
          });
          g.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              window.location.href = '/document/' + encodeURIComponent(m.ark) + langq;
            }
          });
          n++;
        });
      });
      countEl.textContent = n ? n + ' ' + S('Events') : S('NoPoints');
      emptyEl.hidden = n > 0;
    }

    // عدّاد + حالة فارغة + مفتاح
    var meta = document.createElement('div');
    meta.className = 'smap-meta';
    var countEl = document.createElement('div');
    countEl.className = 'smap-count';
    meta.appendChild(countEl);
    var legend = document.createElement('div');
    legend.className = 'smap-legend';
    legend.innerHTML =
      '<span class="smap-leg"><span class="smap-dot smap-dot-city" aria-hidden="true"></span>' + esc(S('City')) + '</span>' +
      '<span class="smap-leg"><span class="smap-dot smap-dot-region" aria-hidden="true"></span>' + esc(S('RegionKind')) + '</span>' +
      '<span class="smap-leg"><span class="smap-dot smap-dot-site" aria-hidden="true"></span>' + esc(S('Site')) + '</span>';
    meta.appendChild(legend);
    root.appendChild(meta);

    var emptyEl = document.createElement('div');
    emptyEl.className = 'smap-empty';
    emptyEl.textContent = S('NoPoints');
    emptyEl.hidden = true;
    root.appendChild(emptyEl);

    regionSel.addEventListener('change', renderPoints);
    renderPoints();
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-sidjil-map]');
    for (var i = 0; i < nodes.length; i++) initOne(nodes[i]);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
