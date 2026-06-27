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

  /* ───── Singleton trigger button ────────────────────────────────────
   * X rebuilds the search box on every SPA navigation, so the trigger
   * button's lifetime must NOT be tied to one input instance. We keep a
   * single persistent button: on each scan we just reposition it next to
   * the current search box, never destroying/recreating it. This kills the
   * click-swallowing race where the button was removed between pointerdown
   * and pointerup (especially when two copies of the extension are
   * installed and each was tearing down the other's button). */
  let triggerBtn = null;

  /* Per-instance namespace so this copy only ever sees its OWN trigger
   * button. Without it, two installed copies each ran a MutationObserver
   * that treated the other copy's button as an orphan and deleted it. */
  const TRIGGER_ID = 'xsf-trigger-' + Math.floor(performance.now() * 1e9).toString(36);
  const TRIGGER_SELECTOR = `button[id="${TRIGGER_ID}"]`;

  function getI18n() {
    try { return NS.i18n; } catch (_) { return null; }
  }

  function getTriggerText() {
    return lang === 'zh' ? '高级搜索' : 'Advanced';
  }

  /* Update the trigger button's label + tooltip to match the current language.
   * Called when the language changes (storage listener) so the button flips
   * from Advanced ⇄ 高级搜索 without a page reload. */
  function refreshTriggerText() {
    const btn = triggerBtn;
    if (!btn || !btn.isConnected) return;
    btn.textContent = getTriggerText();
    const i18n = getI18n();
    if (i18n) btn.title = i18n.t(lang, 'triggerTip') || '';
  }

  /* Detect X's light/dark theme by sampling the body background luminance.
   * Used to pick an opaque button background that overlays long search text
   * cleanly in either theme. */
  function isDarkTheme() {
    const bg = getComputedStyle(document.body).backgroundColor || '';
    const m = bg.match(/\d+/g);
    if (!m) return false;
    const lum = 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2];
    return lum < 128;
  }

  /* ───── Trigger button: inject & position ─────────────────────────── */

  /* Find the currently visible/usable search input on the page, in document
   * order. Used at click time and at scan time — we never cache an input
   * reference across SPA navigations, because X replaces the element. */
  function findUsableSearchInput() {
    const inputs = document.querySelectorAll(SEARCH_INPUT_SELECTOR);
    for (const input of inputs) {
      if (isUsableSearchInput(input)) return input;
    }
    return null;
  }

  function buildTriggerButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'X Search Filters');
    btn.id = TRIGGER_ID;
    // Pick an opaque-ish background that matches the page theme, so the
    // button cleanly OVERLAYS long search text instead of letting the text
    // show through. The user's long input is left intact (no truncation);
    // the button simply sits on top of whatever text it covers.
    const dark = isDarkTheme();
    const idleBg   = dark ? 'rgba(21,32,43,0.92)' : 'rgba(255,255,255,0.92)';
    const hoverBg  = dark ? 'rgba(29,155,240,0.92)' : 'rgba(29,155,240,0.95)';
    const idleFg   = dark ? '#e7e9ea' : '#0f1419';
    const borderColor = 'rgba(29,155,240,0.45)';
    btn.style.cssText = [
      'position:fixed',
      'width:auto',
      'height:26px',
      'border-radius:999px',
      `border:1px solid ${borderColor}`,
      `background:${idleBg}`,
      `color:${idleFg}`,
      'cursor:pointer',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'font-size:12px',
      'font-weight:700',
      'line-height:1',
      'padding:0 9px',
      'z-index:2147483645',
      'box-shadow:0 1px 4px rgba(0,0,0,0.12)',
      'transition:background 0.15s ease, color 0.15s ease',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      '-webkit-backdrop-filter:blur(4px)',
      'backdrop-filter:blur(4px)'
    ].join(';');
    btn.textContent = getTriggerText();
    const hoverFg = '#ffffff';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = hoverBg;
      btn.style.color = hoverFg;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = idleBg;
      btn.style.color = idleFg;
    });
    // Click resolves the search box LIVE. The button is a singleton that
    // survives across SPA navigations, so we must not trust any input
    // reference captured at build time — it may belong to a box X already
    // torn down. resolveInput() re-queries the DOM on every click.
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanelFor(findUsableSearchInput());
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

  /* Reposition the singleton button next to `input`. If `input` is gone
   * or unusable, hide the button instead of removing it — removing it was
   * what created the click race, and the button is reused for the next
   * search box anyway. */
  function positionTrigger(input) {
    const btn = triggerBtn;
    if (!btn || !btn.isConnected) return;
    if (!isUsableSearchInput(input)) {
      btn.style.display = 'none';
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

  /* Ensure the singleton button exists, then snap it to the current search
   * box (if any). Called from scan() and bindInput(). */
  function ensureTrigger() {
    if (!triggerBtn || !triggerBtn.isConnected) {
      triggerBtn = buildTriggerButton();
      document.body.appendChild(triggerBtn);
    }
    positionTrigger(findUsableSearchInput());
  }

  function repositionAllTriggers() {
    positionTrigger(findUsableSearchInput());
  }

  /* With a singleton + per-instance id, orphan cleanup collapses to: if our
   * button somehow left the DOM, drop the stale reference. We never touch
   * buttons owned by another copy of the extension — the TRIGGER_ID
   * namespace guarantees they're invisible to this selector. */
  function removeOrphanTriggers() {
    if (triggerBtn && !triggerBtn.isConnected) triggerBtn = null;
  }

  /* ───── Search-input bindings ─────────────────────────────────────── */

  const boundInputs = new WeakSet();

  function bindInput(input) {
    if (!looksLikeSearchInput(input)) return;
    if (!boundInputs.has(input)) {
      boundInputs.add(input);
      input.addEventListener('keydown', onInputKeyDown);
    }
    ensureTrigger();
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

    // Re-scan on any DOM mutation that could create/destroy a search input.
    // We debounce with a single rAF + short timer so bursts of mutations only
    // cost one scan, and we ALWAYS scan (not just on direct search-box hits),
    // because X often rebuilds the search box asynchronously inside a freshly
    // inserted container — which the previous "direct match" check missed,
    // causing the Advanced button to vanish after a few in-tab navigations.
    let scanQueued = false;
    function queueScan() {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        scan(document);
      });
    }
    const obs = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) { relevant = true; break; }
        if (m.removedNodes && m.removedNodes.length) { relevant = true; break; }
      }
      if (relevant) queueScan();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Trigger buttons follow the input on scroll / resize.
    window.addEventListener('scroll', repositionAllTriggers, true);
    window.addEventListener('resize', repositionAllTriggers);

    // Keep the trigger button's label in sync with the UI language the user
    // picks in the panel. The panel writes the new language to storage; we
    // listen here so the Advanced ⇄ 高级搜索 swap happens live, no reload.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const c = changes[NS.storage && NS.storage.KEY_LANG];
        if (!c) return;
        const next = c.newValue;
        if (next === 'en' || next === 'zh') {
          lang = next;
          refreshTriggerText();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
