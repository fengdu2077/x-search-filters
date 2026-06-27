/* Panel v0.2 — compact tabbed layout.
 * Fixed-height panel; per-category sub-tabs; chip groups for booleans;
 * inline ranges for engagement; header icon buttons toggle History /
 * Favorites views. Renders inside a Shadow DOM. */
(function () {
  const NS = (window.XSF = window.XSF || {});
  const { i18n, operators, queryBuilder, reactInput, storage } = NS;

  /* ──────────────────────────────────────────────────────────
   *  Tiny DOM helper. attrs:
   *    class, style (object), html, on<Event>(fn), aria-*, etc.
   * ────────────────────────────────────────────────────────── */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else if (k === 'html') node.innerHTML = v;
        else if (v != null && v !== false) {
          node.setAttribute(k, v === true ? '' : v);
        }
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function detectTheme() {
    const bg = getComputedStyle(document.body).backgroundColor || '';
    const m = bg.match(/\d+/g);
    if (!m) return 'light';
    const lum = 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2];
    return lum < 128 ? 'dark' : 'light';
  }

  /* ──────────────────────────────────────────────────────────
   *  Panel factory
   * ────────────────────────────────────────────────────────── */
  function createPanel({ cssText }) {
    const host = document.createElement('div');
    host.id = 'xsf-host';
    host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483646;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(Object.assign(document.createElement('style'), { textContent: cssText }));

    const root = el('div', { class: 'xsf-root', 'data-theme': detectTheme() });
    shadow.appendChild(root);

    /* --- State --- */
    let lang = i18n.DEFAULT_LANG;
    let activeView = 'filters';     // 'filters' | 'history' | 'favorites'
    let activeCategory = 'query';   // one of operators.CATEGORIES
    let searchInput = null;
    let state = {};
    let lastBuilt = '';
    let visible = false;

    /* --- Field lookup (build a map by key once) --- */
    const fieldByKey = Object.create(null);
    for (const f of operators.FIELDS) fieldByKey[f.key] = f;

    /* --- Query sync —— internal preview ONLY.
     *
     *  v0.3 rule: panel never writes to the X search bar during editing.
     *  The search bar is only modified on Apply. This eliminates the race
     *  with X's autocomplete and the duplicate-write bug. */
    function sync() {
      const { query, warnings } = queryBuilder.build(state);
      lastBuilt = query;
      previewEl.textContent = query || ' ';
      previewEl.title = query || '';
      if (warnings.length) {
        warnEl.textContent = warnings.map((w) => i18n.t(lang, w)).join(' ');
        warnEl.setAttribute('data-show', 'true');
      } else {
        warnEl.textContent = '';
        warnEl.removeAttribute('data-show');
      }
    }

    /* ──────────────────────────────────────────────────────────
     *  Atomic renderers: render a single field by key, returning a
     *  control node (without its own label). Used to compose rows.
     * ────────────────────────────────────────────────────────── */
    function renderControl(key) {
      const f = fieldByKey[key];
      if (!f) return el('span');
      switch (f.type) {
        case 'text':
          return el('input', {
            class: 'xsf-input',
            type: 'text',
            value: state[key] || '',
            placeholder: f.hintKey ? i18n.t(lang, 'hints.' + f.hintKey) : '',
            oninput: (e) => { state[key] = e.target.value; sync(); }
          });
        case 'number':
          return el('input', {
            class: 'xsf-input',
            type: 'number',
            min: '0',
            value: state[key] != null ? state[key] : '',
            oninput: (e) => {
              const v = e.target.value;
              state[key] = v === '' ? '' : Number(v);
              sync();
            }
          });
        case 'date':
          return el('input', {
            class: 'xsf-input',
            type: 'date',
            value: state[key] || '',
            oninput: (e) => { state[key] = e.target.value; sync(); }
          });
        case 'select': {
          const sel = el('select', {
            class: 'xsf-select',
            onchange: (e) => { state[key] = e.target.value; sync(); }
          });
          for (const opt of f.valueOptions) {
            const o = el('option', { value: opt.value }, i18n.t(lang, opt.labelKey));
            if ((state[key] || '') === opt.value) o.selected = true;
            sel.appendChild(o);
          }
          return sel;
        }
        case 'withinTime': {
          const cur = state[key] || { value: '', unit: 'd' };
          const pair = el('div', { class: 'xsf-pair' });
          const num = el('input', {
            class: 'xsf-input', type: 'number', min: '0',
            value: cur.value || '', placeholder: f.hintKey ? i18n.t(lang, 'hints.' + f.hintKey) : ''
          });
          const unit = el('select', { class: 'xsf-select' });
          const units = i18n.t(lang, 'withinUnits');
          for (const u of ['d', 'h', 'm', 's']) {
            const o = el('option', { value: u }, `${u} · ${units[u]}`);
            if (cur.unit === u) o.selected = true;
            unit.appendChild(o);
          }
          const commit = () => {
            const v = num.value === '' ? '' : Number(num.value);
            state[key] = { value: v, unit: unit.value };
            sync();
          };
          num.addEventListener('input', commit);
          unit.addEventListener('change', commit);
          pair.appendChild(num);
          pair.appendChild(unit);
          return pair;
        }
        case 'within': {
          const cur = state[key] || { value: '', unit: 'km' };
          const pair = el('div', { class: 'xsf-pair' });
          const num = el('input', {
            class: 'xsf-input', type: 'number', min: '0',
            value: cur.value || ''
          });
          const unit = el('select', { class: 'xsf-select' });
          for (const u of ['km', 'mi']) {
            const o = el('option', { value: u }, u);
            if (cur.unit === u) o.selected = true;
            unit.appendChild(o);
          }
          const commit = () => {
            const v = num.value === '' ? '' : Number(num.value);
            state[key] = { value: v, unit: unit.value };
            sync();
          };
          num.addEventListener('input', commit);
          unit.addEventListener('change', commit);
          pair.appendChild(num);
          pair.appendChild(unit);
          return pair;
        }
        case 'triState': {
          const tri = el('div', { class: 'xsf-tri' });
          const cur = state[key] || 'off';
          const opts = [
            { v: 'off',     t: lang === 'zh' ? '关' : 'Off' },
            { v: 'on',      t: lang === 'zh' ? '需要' : 'Yes' },
            { v: 'exclude', t: lang === 'zh' ? '排除' : 'No' }
          ];
          for (const o of opts) {
            const b = el('button', {
              type: 'button',
              'aria-pressed': cur === o.v ? 'true' : 'false',
              onclick: () => {
                state[key] = o.v;
                tri.querySelectorAll('button').forEach((bb) => {
                  bb.setAttribute('aria-pressed', bb === b ? 'true' : 'false');
                });
                sync();
              }
            }, o.t);
            tri.appendChild(b);
          }
          return tri;
        }
        case 'radioMedia': {
          // Mutually-exclusive media group: '' (off/any) | media | images | videos.
          // Picking an option clears the others; clicking the active one again
          // clears it back to '' (off) so the user can drop the filter entirely.
          const wrap = el('div', { class: 'xsf-radio' });
          const opts = [
            { v: 'media',  labelKey: 'filterMedia' },
            { v: 'images', labelKey: 'filterImages' },
            { v: 'videos', labelKey: 'filterVideos' }
          ];
          const cur = state[key] || '';
          for (const o of opts) {
            const active = cur === o.v;
            const b = el('button', {
              type: 'button',
              class: 'xsf-chip',
              'aria-pressed': active ? 'true' : 'false',
              onclick: () => {
                state[key] = active ? '' : o.v;
                wrap.querySelectorAll('button').forEach((bb) => {
                  bb.setAttribute('aria-pressed', bb === b && !active ? 'true' : 'false');
                });
                sync();
              }
            }, i18n.t(lang, 'labels.' + o.labelKey));
            wrap.appendChild(b);
          }
          return wrap;
        }
      }
      return el('span');
    }

    function renderLangFilter() {
      const f = fieldByKey.lang;
      const wrap = el('div', { class: 'xsf-lang-filter' });
      wrap.appendChild(el('span', { class: 'xsf-lang-filter-label' }, lang === 'zh' ? '语言' : 'Lang'));
      const sel = el('select', {
        class: 'xsf-lang-filter-select',
        onchange: (e) => { state.lang = e.target.value; sync(); }
      });
      for (const opt of f.valueOptions) {
        const o = el('option', { value: opt.value }, i18n.t(lang, opt.labelKey));
        if ((state.lang || '') === opt.value) o.selected = true;
        sel.appendChild(o);
      }
      wrap.appendChild(sel);
      return wrap;
    }

    /* Field with label above (default vertical layout) */
    function fieldBlock(key) {
      const f = fieldByKey[key];
      if (!f) return el('span');
      return el('div', { class: 'xsf-field' },
        el('label', { class: 'xsf-field-label' }, i18n.t(lang, 'labels.' + f.labelKey)),
        renderControl(key)
      );
    }

    /* Horizontal group of field blocks sharing one row */
    function fieldCols(...keys) {
      const wrap = el('div', { class: 'xsf-cols xsf-row-pad' });
      for (const k of keys) wrap.appendChild(fieldBlock(k));
      return wrap;
    }

    function fieldColsN(className, ...keys) {
      const wrap = el('div', { class: `xsf-cols ${className} xsf-row-pad` });
      for (const k of keys) wrap.appendChild(fieldBlock(k));
      return wrap;
    }

    function weightedSourceLocationRow() {
      const row = el('div', { class: 'xsf-cols xsf-cols-source-location xsf-row-pad' });
      row.appendChild(fieldBlock('near'));
      row.appendChild(fieldBlock('within'));
      return row;
    }

    /* Toggle-chip group from a list of bool field keys */
    function chipGroup(keys) {
      const wrap = el('div', { class: 'xsf-chips' });
      for (const k of keys) {
        const f = fieldByKey[k];
        if (!f) continue;
        const pressed = state[k] === 'on';
        const chip = el('button', {
          type: 'button',
          class: 'xsf-chip',
          'aria-pressed': pressed ? 'true' : 'false',
          onclick: () => {
            const on = state[k] === 'on';
            state[k] = on ? 'off' : 'on';
            chip.setAttribute('aria-pressed', on ? 'false' : 'true');
            sync();
          }
        }, i18n.t(lang, 'labels.' + f.labelKey));
        wrap.appendChild(chip);
      }
      return wrap;
    }

    /* Range row: label + two number inputs */
    function rangeRow(minKey, maxKey, labelText) {
      const r = el('div', { class: 'xsf-range xsf-row-pad' });
      r.appendChild(el('div', { class: 'xsf-range-label' }, labelText));
      r.appendChild(renderControl(minKey));
      r.appendChild(el('div', { class: 'xsf-range-sep' }, i18n.t(lang, 'range.to')));
      r.appendChild(renderControl(maxKey));
      // Style overrides: min/max inputs need numeric placeholders for clarity
      const rg = i18n.t(lang, 'range');
      const inputs = r.querySelectorAll('input');
      if (inputs[0]) inputs[0].setAttribute('placeholder', rg.min);
      if (inputs[1]) inputs[1].setAttribute('placeholder', rg.max);
      return r;
    }

    /* Inline label + control on the same row (tri-state etc.) */
    function inlineRow(key) {
      const f = fieldByKey[key];
      if (!f) return el('span');
      return el('div', { class: 'xsf-inline-row' },
        el('label', { class: 'xsf-field-label' }, i18n.t(lang, 'labels.' + f.labelKey)),
        renderControl(key)
      );
    }

    /* ──────────────────────────────────────────────────────────
     *  Per-category tab renderers
     * ────────────────────────────────────────────────────────── */
    function tabQuery() {
      const w = el('div');
      w.appendChild(fieldBlock('exactPhrase'));
      w.appendChild(fieldBlock('orTerms'));
      w.appendChild(fieldBlock('exclude'));
      w.appendChild(fieldColsN('xsf-cols-2', 'hashtag', 'url'));
      return w;
    }
    function tabSource() {
      const w = el('div');
      w.appendChild(fieldColsN('xsf-cols-2', 'from', 'to'));
      w.appendChild(weightedSourceLocationRow());
      w.appendChild(chipGroup(['filterVerified', 'filterFollows']));
      return w;
    }
    function tabFilters() {
      const w = el('div');
      w.appendChild(fieldBlock('withinTime'));
      w.appendChild(fieldColsN('xsf-cols-2', 'since', 'until'));
      w.appendChild(fieldColsN('xsf-cols-3', 'minFaves', 'minRetweets', 'minReplies'));
      return w;
    }
    function tabType() {
      const w = el('div');
      // Media is a single-row mutually-exclusive group (any / images / videos).
      w.appendChild(fieldBlock('radioMedia'));
      w.appendChild(chipGroup(['filterLinks', 'filterQuote', 'filterReplies']));
      return w;
    }

    const TAB_RENDERERS = {
      query:   tabQuery,
      source:  tabSource,
      filters: tabFilters,
      type:    tabType
    };

    /* ──────────────────────────────────────────────────────────
     *  History / Favorites lists
     * ────────────────────────────────────────────────────────── */

    /* Format a ms timestamp as local YYYY-MM-DD HH:MM. Same shape for EN/ZH. */
    function formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
             `${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    async function renderHistoryView() {
      const wrap = el('div');
      const list = await storage.getHistory();
      if (!list.length) {
        wrap.appendChild(el('div', { class: 'xsf-empty' }, i18n.t(lang, 'empty')));
        return wrap;
      }
      const ul = el('ul', { class: 'xsf-list' });
      for (const item of list) {
        ul.appendChild(el('li', { class: 'xsf-list-item' },
          el('div', { class: 'xsf-list-query' }, item.query),
          el('div', { class: 'xsf-list-meta' },
            el('div', { class: 'xsf-list-time' }, formatTime(item.ts)),
            el('button', {
              class: 'xsf-btn', type: 'button',
              onclick: () => applyRawQuery(item.query)
            }, i18n.t(lang, 'use'))
          )
        ));
      }
      wrap.appendChild(ul);
      return wrap;
    }

    async function renderFavoritesView() {
      const wrap = el('div');
      const list = await storage.getFavorites();
      if (!list.length) {
        wrap.appendChild(el('div', { class: 'xsf-empty' }, i18n.t(lang, 'empty')));
        return wrap;
      }
      const ul = el('ul', { class: 'xsf-list' });
      for (const item of list) {
        ul.appendChild(el('li', { class: 'xsf-list-item' },
          el('div', { class: 'xsf-list-name' }, item.name),
          el('div', { class: 'xsf-list-query' }, item.query),
          el('div', { class: 'xsf-list-actions' },
            el('button', {
              class: 'xsf-btn', type: 'button',
              onclick: () => applyRawQuery(item.query)
            }, i18n.t(lang, 'use')),
            el('button', {
              class: 'xsf-btn', type: 'button',
              onclick: async () => {
                await storage.removeFavorite(item.id);
                redraw();
              }
            }, i18n.t(lang, 'remove'))
          )
        ));
      }
      wrap.appendChild(ul);
      return wrap;
    }

    function applyRawQuery(q) {
      state = { keywords: q };
      activeView = 'filters';
      redraw();
      sync();
      if (searchInput) searchInput.focus();
    }

    /* ──────────────────────────────────────────────────────────
     *  Layout skeleton (created once, repopulated by redraw)
     * ────────────────────────────────────────────────────────── */
    const header = el('div', { class: 'xsf-header' });
    const titleEl = el('div', { class: 'xsf-title' });
    const langBtn = el('button', { class: 'xsf-lang xsf-lang-header', type: 'button' });
    const headerSpacer = el('div', { class: 'xsf-header-spacer' });
    const histBtn = el('button', { class: 'xsf-icon-btn', type: 'button', title: '' }, '⏱');
    const favBtn  = el('button', { class: 'xsf-icon-btn', type: 'button', title: '' }, '★');
    const closeBtn = el('button', { class: 'xsf-icon-btn', type: 'button', title: '' }, '✕');
    histBtn.addEventListener('click', () => {
      activeView = activeView === 'history' ? 'filters' : 'history';
      redraw();
    });
    favBtn.addEventListener('click', () => {
      activeView = activeView === 'favorites' ? 'filters' : 'favorites';
      redraw();
    });
    closeBtn.addEventListener('click', () => hide());
    header.appendChild(titleEl);
    header.appendChild(langBtn);
    header.appendChild(headerSpacer);
    header.appendChild(histBtn);
    header.appendChild(favBtn);
    header.appendChild(closeBtn);

    const kwWrap = el('div', { class: 'xsf-kw' });
    const kwPrefix = el('div', { class: 'xsf-kw-prefix' }, '🔍');
    const kwInput = el('input', {
      type: 'text',
      oninput: (e) => { state.keywords = e.target.value; sync(); },
      onkeydown: (e) => {
        if (e.key === 'Enter') {
          // Enter in keywords field = Apply (single-write semantics)
          e.preventDefault();
          e.stopPropagation();
          doApply();
        }
      }
    });
    kwWrap.appendChild(kwPrefix);
    kwWrap.appendChild(kwInput);

    const tabsSub = el('div', { class: 'xsf-tabs-sub' });
    const bodyEl = el('div', { class: 'xsf-body' });
    const warnEl = el('div', { class: 'xsf-warning' });
    const footer = el('div', { class: 'xsf-footer' });
    const previewEl = el('div', { class: 'xsf-preview' });
    const copyBtn = el('button', { class: 'xsf-btn', type: 'button' });
    const resetBtn = el('button', { class: 'xsf-btn', type: 'button' });
    const saveBtn  = el('button', { class: 'xsf-btn', type: 'button' });
    const applyBtn = el('button', { class: 'xsf-btn xsf-primary', type: 'button' });

    langBtn.addEventListener('click', async () => {
      lang = lang === 'en' ? 'zh' : 'en';
      await storage.setLang(lang);
      redraw();
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lastBuilt || '');
        const orig = copyBtn.textContent;
        copyBtn.textContent = i18n.t(lang, 'copied');
        setTimeout(() => { copyBtn.textContent = orig; }, 1200);
      } catch (_) { /* no-op */ }
    });
    resetBtn.addEventListener('click', () => {
      state = {};
      kwInput.value = '';
      if (searchInput && searchInput.isConnected) {
        reactInput.setValue(searchInput, '');
      }
      redraw();
      sync();
    });

    function submitThroughX(input) {
      input.focus();
      const form = input.closest('form');
      if (form) {
        try {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return;
          }
        } catch (_) {
          // Fall through to keyboard simulation.
        }
        try {
          const ok = form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          if (!ok) return;
        } catch (_) {
          // Fall through to keyboard simulation.
        }
      }
      reactInput.submitSearch(input);
    }
    saveBtn.addEventListener('click', async () => {
      const q = lastBuilt;
      if (!q) return;
      const name = window.prompt(i18n.t(lang, 'saveAsPrompt'), q.slice(0, 40));
      if (name == null) return;
      await storage.addFavorite({ name, query: q });
    });
    /* The single-write Apply: write final query to the search bar
     * (the only time we touch it), record history, submit, close. */
    async function doApply() {
      const finalQuery = lastBuilt;
      if (searchInput && searchInput.isConnected) {
        // X's search box is React-controlled. Clearing first prevents React's
        // previous internal value from being reconciled back into the input and
        // appended/duplicated when we set the final advanced query.
        searchInput.focus();
        reactInput.setValue(searchInput, '');
        await new Promise((resolve) => setTimeout(resolve, 0));
        reactInput.setValue(searchInput, finalQuery);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (finalQuery) await storage.pushHistory(finalQuery);
      hide();
      if (finalQuery && searchInput && searchInput.isConnected) {
        submitThroughX(searchInput);
      }
    }

    applyBtn.addEventListener('click', doApply);

    footer.appendChild(previewEl);
    footer.appendChild(copyBtn);
    footer.appendChild(resetBtn);
    footer.appendChild(saveBtn);
    footer.appendChild(applyBtn);

    root.appendChild(header);
    root.appendChild(kwWrap);
    root.appendChild(tabsSub);
    root.appendChild(bodyEl);
    root.appendChild(warnEl);
    root.appendChild(footer);

    /* ──────────────────────────────────────────────────────────
     *  Redraw entry point
     * ────────────────────────────────────────────────────────── */
    function redraw() {
      // Header
      titleEl.textContent = i18n.t(lang, 'title');
      langBtn.textContent = lang === 'en' ? '中' : 'EN';
      resetBtn.textContent = i18n.t(lang, 'reset');
      saveBtn.textContent  = i18n.t(lang, 'save');
      applyBtn.textContent = i18n.t(lang, 'apply');
      const views = i18n.t(lang, 'views');
      histBtn.setAttribute('title', views.history);
      favBtn.setAttribute('title',  views.favorites);
      closeBtn.setAttribute('title', i18n.t(lang, 'close'));
      histBtn.setAttribute('aria-pressed', activeView === 'history' ? 'true' : 'false');
      favBtn.setAttribute('aria-pressed',  activeView === 'favorites' ? 'true' : 'false');

      // Keywords field (always visible)
      kwInput.placeholder = i18n.t(lang, 'keywordsPlaceholder');
      if (kwInput.value !== (state.keywords || '')) kwInput.value = state.keywords || '';

      // Sub-tab strip visible only in Filters view
      if (activeView === 'filters') {
        kwWrap.style.display = '';
        tabsSub.style.display = '';
        copyBtn.textContent = i18n.t(lang, 'copyQuery');
        tabsSub.innerHTML = '';
        for (const cat of operators.CATEGORIES) {
          tabsSub.appendChild(el('button', {
            type: 'button',
            'aria-selected': cat === activeCategory ? 'true' : 'false',
            onclick: () => { activeCategory = cat; redraw(); }
          }, i18n.t(lang, 'categories.' + cat)));
        }
        tabsSub.appendChild(el('div', { class: 'xsf-tabs-spacer' }));
        tabsSub.appendChild(renderLangFilter());
      } else {
        // History / Favorites: hide kw + tab strip
        kwWrap.style.display = 'none';
        tabsSub.style.display = 'none';
      }

      // Body
      bodyEl.innerHTML = '';
      if (activeView === 'filters') {
        const r = TAB_RENDERERS[activeCategory] || TAB_RENDERERS.query;
        bodyEl.appendChild(r());
      } else {
        const placeholder = el('div', { class: 'xsf-empty' }, '…');
        bodyEl.appendChild(placeholder);
        const promise = activeView === 'history'
          ? renderHistoryView()
          : renderFavoritesView();
        promise.then((node) => {
          if (
            (activeView === 'history' || activeView === 'favorites') &&
            placeholder.parentNode === bodyEl
          ) {
            bodyEl.innerHTML = '';
            bodyEl.appendChild(node);
          }
        });
      }

      sync();
    }

    /* --- Positioning --- */
    function reposition() {
      const w = 440;
      const h = 412;
      // No usable search box (e.g. X tore it down, or the panel was opened
      // without one) → center on screen so it's always visible instead of
      // silently returning and leaving the panel wherever its last coords
      // were (often off-screen, which read as "click did nothing").
      if (!searchInput || !searchInput.isConnected) {
        root.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px';
        root.style.top = Math.max(8, (window.innerHeight - h) / 2) + 'px';
        return;
      }
      const r = searchInput.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
      // Prefer below; flip above if there isn't room
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) {
        const altTop = r.top - h - 6;
        top = altTop > 8 ? altTop : Math.max(8, window.innerHeight - h - 8);
      }
      root.style.left = left + 'px';
      root.style.top = top + 'px';
    }

    function show(inputEl) {
      searchInput = inputEl;
      if (!host.isConnected) document.body.appendChild(host);
      visible = true;
      // The panel is the source of truth, not the search bar. We keep the
      // last structured state (from/user, dates, min_faves, …) so the user
      // can reopen the panel and keep tweaking. We deliberately do NOT read
      // the search bar back into the panel: importing whatever X left in the
      // bar (which X may rewrite after a submit) used to pile the previous
      // query on top of the existing filters on every reopen, snowballing.
      // To start fresh, the user clicks Reset.
      root.setAttribute('data-theme', detectTheme());
      redraw();
      reposition();
      // Move focus into the panel keyword field so typing works immediately
      // without further user clicks; this also blurs X's autocomplete dropdown.
      setTimeout(() => { try { kwInput.focus(); } catch (_) {} }, 0);
    }
    function hide() {
      visible = false;
      if (host.parentNode) host.parentNode.removeChild(host);
    }
    function isVisible() { return visible; }
    function contains(node) { return host.contains(node) || shadow.contains(node); }

    /* Restore saved language. */
    storage.getLang().then((l) => {
      if (l) { lang = l; if (visible) redraw(); }
    });

    window.addEventListener('scroll', () => visible && reposition(), true);
    window.addEventListener('resize', () => visible && reposition());

    return {
      show, hide, isVisible, contains, reposition,
      get searchInput() { return searchInput; },
      onSubmit() { if (lastBuilt) storage.pushHistory(lastBuilt); }
    };
  }

  NS.panel = { createPanel };
})();
