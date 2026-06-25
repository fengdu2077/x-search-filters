/* Content script entry point — v0.3 explicit-trigger model.
 *
 * Rules:
 *   • Focus/click on X's search bar does NOT open the panel.
 *     X's native autocomplete remains untouched.
 *   • A small ▾ trigger button is injected just outside the right
 *     edge of every X search input. Click → open panel.
 *   • Ctrl/Cmd+Shift+F while focused in X search bar → open panel.
 *   • Esc → close panel (handled here for the search-bar focus case).
 *   • Enter on the search bar (no panel) → record history (best-effort).
 */
(function () {
  const NS = window.XSF;
  if (!NS || !NS.panel) return;

  const SEARCH_INPUT_SELECTOR = [
    'input[data-testid="SearchBox_Search_Input"]',
    'input[aria-label*="Search" i]',
    'input[aria-label*="搜索" i]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="搜索" i]',
    'input[role="combobox"][aria-autocomplete]'
  ].join(', ');

  /* Active state */
  let panelApi = null;
  let cssText = '';
  let lang = 'en';                         // mirrors panel's language for tooltip
  const triggerByInput = new WeakMap();    // input -> button element

  function getI18n() {
    try { return NS.i18n; } catch (_) { return null; }
  }

  function getTriggerText() {
    return lang === 'zh' ? '高级搜索' : 'Advanced';
  }

  /* ───── Trigger button: inject & position ─────────────────────────── */

  function buildTriggerButton(input) {
    const btn = document.createElement('button');
    btn.__xsfInput = input;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'X Search Filters');
    btn.id = 'xsf-trigger-' + Math.floor(performance.now() * 1000).toString(36);
    btn.style.cssText = [
      'position:fixed',
      'width:auto',
      'height:26px',
      'border-radius:999px',
      'border:1px solid rgba(29,155,240,0.35)',
      'background:rgba(29,155,240,0.10)',
      'color:#1d9bf0',
      'cursor:pointer',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'font-size:12px',
      'font-weight:700',
      'line-height:1',
      'padding:0 9px',
      'z-index:2147483645',
      'box-shadow:0 1px 4px rgba(0,0,0,0.12)',
      'transition:background 0.15s ease',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'
    ].join(';');
    btn.textContent = getTriggerText();
    const idleBg = 'rgba(29,155,240,0.10)';
    const hoverBg = 'rgba(29,155,240,0.18)';
    btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg; });
    btn.addEventListener('mouseleave', () => { btn.style.background = idleBg; });
    // Adapt border contrast to dark theme by sampling body bg.
    const bg = getComputedStyle(document.body).backgroundColor || '';
    const m = bg.match(/\d+/g);
    if (m && (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) < 128) {
      btn.style.borderColor = 'rgba(29,155,240,0.45)';
    }
    // Tooltip
    const i18n = getI18n();
    if (i18n) btn.title = i18n.t(lang, 'triggerTip') || '';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanelFor(input);
    });
    // Don't let pointerdown on this button propagate to the outside-close handler
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    return btn;
  }

  function looksLikeSearchInput(input) {
    if (!input) return false;
    const testid = input.getAttribute('data-testid') || '';
    const text = [
      input.getAttribute('aria-label') || '',
      input.getAttribute('placeholder') || '',
      testid
    ].join(' ').toLowerCase();
    return (
      testid === 'SearchBox_Search_Input' ||
      text.includes('search') ||
      text.includes('搜索')
    );
  }

  function isUsableSearchInput(input) {
    if (!input || !input.isConnected || !looksLikeSearchInput(input)) return false;
    const r = input.getBoundingClientRect();
    if (r.width < 40 || r.height < 12) return false;
    const style = getComputedStyle(input);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function positionTrigger(btn, input) {
    if (!isUsableSearchInput(input)) {
      btn.remove();
      return;
    }
    const r = input.getBoundingClientRect();
    btn.style.display = '';
    btn.textContent = getTriggerText();
    const i18n = getI18n();
    if (i18n) btn.title = i18n.t(lang, 'triggerTip') || '';
    const width = btn.offsetWidth || (lang === 'zh' ? 70 : 86);
    const height = 26;
    // Place inside the search input, near the right edge, leaving space for
    // X's own clear button. This makes the feature discoverable without
    // blocking the default autocomplete behavior.
    let left = r.right - width - 36;
    if (left < r.left + 8) left = r.left + 8;
    const top = r.top + (r.height - height) / 2;
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
  }

  function ensureTrigger(input) {
    if (!isUsableSearchInput(input)) return;
    let btn = triggerByInput.get(input);
    if (!btn || !btn.isConnected) {
      btn = buildTriggerButton(input);
      document.body.appendChild(btn);
      triggerByInput.set(input, btn);
    }
    positionTrigger(btn, input);
  }

  function repositionAllTriggers() {
    document.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach((input) => {
      const btn = triggerByInput.get(input);
      if (btn) positionTrigger(btn, input);
    });
    removeOrphanTriggers();
  }

  function removeOrphanTriggers() {
    document.querySelectorAll('button[id^="xsf-trigger-"]').forEach((btn) => {
      const input = btn.__xsfInput;
      // Drop the button if its owning input was removed, hidden by SPA route
      // transition, or replaced by a new search input instance.
      if (!isUsableSearchInput(input) || triggerByInput.get(input) !== btn) {
        btn.remove();
      }
    });
  }

  /* ───── Search-input bindings ─────────────────────────────────────── */

  const boundInputs = new WeakSet();

  function bindInput(input) {
    if (!looksLikeSearchInput(input)) return;
    if (!boundInputs.has(input)) {
      boundInputs.add(input);
      input.addEventListener('keydown', onInputKeyDown);
    }
    ensureTrigger(input);
  }

  function onInputKeyDown(e) {
    const input = e.currentTarget;
    // Ctrl/Cmd+Shift+F → open the panel
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      e.stopPropagation();
      openPanelFor(input);
      return;
    }
    // Enter while panel is closed: let X submit, but record history.
    if (e.key === 'Enter' && panelApi && !panelApi.isVisible()) {
      const q = (input.value || '').trim();
      if (q && NS.storage && NS.storage.pushHistory) NS.storage.pushHistory(q);
    }
  }

  function openPanelFor(input) {
    if (!panelApi) return;
    panelApi.show(input);
  }

  function scan(root) {
    (root || document).querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(bindInput);
    removeOrphanTriggers();
  }

  /* ───── Outside-click / Escape closer ─────────────────────────────── */

  function installGlobalCloser() {
    document.addEventListener('pointerdown', (e) => {
      if (!panelApi || !panelApi.isVisible()) return;
      const target = e.composedPath ? e.composedPath()[0] : e.target;
      if (panelApi.contains(target)) return;
      // Don't close when clicking a trigger button or the search input itself
      if (target && target.id && target.id.startsWith('xsf-trigger-')) return;
      if (target === panelApi.searchInput) return;
      panelApi.hide();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelApi && panelApi.isVisible()) {
        panelApi.hide();
      }
    });
  }

  /* ───── SPA route watcher (very low frequency) ────────────────────── */

  function scheduleRouteScans() {
    requestAnimationFrame(() => scan(document));
    setTimeout(() => scan(document), 300);
    setTimeout(() => scan(document), 1000);
  }

  function installRouteWatcher() {
    let lastUrl = location.href;
    const onRouteMaybeChanged = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      scheduleRouteScans();
    };
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name];
      history[name] = function () {
        const ret = original.apply(this, arguments);
        onRouteMaybeChanged();
        return ret;
      };
    }
    window.addEventListener('popstate', onRouteMaybeChanged);
  }

  /* ───── CSS bootstrap ─────────────────────────────────────────────── */

  async function loadCss() {
    try {
      const url = chrome.runtime.getURL('src/panel.css');
      const res = await fetch(url);
      cssText = await res.text();
    } catch (_) {
      cssText = '';
    }
  }

  /* ───── Init ──────────────────────────────────────────────────────── */

  async function init() {
    await loadCss();
    if (NS.storage && NS.storage.getLang) {
      try { const l = await NS.storage.getLang(); if (l) lang = l; } catch (_) {}
    }
    panelApi = NS.panel.createPanel({ cssText });
    installGlobalCloser();
    installRouteWatcher();
    scan(document);

    const obs = new MutationObserver((mutations) => {
      let shouldScan = false;
      let shouldCleanup = false;
      for (const m of mutations) {
        for (const n of m.addedNodes || []) {
          if (!(n instanceof Element)) continue;
          if (n.matches && n.matches(SEARCH_INPUT_SELECTOR)) { shouldScan = true; break; }
          if (n.querySelector && n.querySelector(SEARCH_INPUT_SELECTOR)) { shouldScan = true; break; }
        }
        for (const n of m.removedNodes || []) {
          if (!(n instanceof Element)) continue;
          if (n.matches && n.matches(SEARCH_INPUT_SELECTOR)) { shouldCleanup = true; break; }
          if (n.querySelector && n.querySelector(SEARCH_INPUT_SELECTOR)) { shouldCleanup = true; break; }
        }
        if (shouldScan || shouldCleanup) break;
      }
      if (shouldScan) scan(document);
      else if (shouldCleanup) removeOrphanTriggers();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Trigger buttons follow the input on scroll / resize.
    window.addEventListener('scroll', repositionAllTriggers, true);
    window.addEventListener('resize', repositionAllTriggers);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
