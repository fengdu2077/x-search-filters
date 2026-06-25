/* chrome.storage.local wrapper for history + favorites + language.
 * All public functions return Promises. */
(function () {
  const KEY_HISTORY   = 'xsf.history';
  const KEY_FAVORITES = 'xsf.favorites';
  const KEY_LANG      = 'xsf.lang';

  const HISTORY_MAX   = 50;
  const FAVORITES_SOFT_MAX = 200;

  function get(key, fallback) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (obj) => {
          if (chrome.runtime.lastError) return resolve(fallback);
          resolve(obj && key in obj ? obj[key] : fallback);
        });
      } catch (_) {
        resolve(fallback);
      }
    });
  }

  function set(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  async function getHistory() {
    const arr = await get(KEY_HISTORY, []);
    return Array.isArray(arr) ? arr : [];
  }

  async function pushHistory(query) {
    const q = (query || '').trim();
    if (!q) return;
    const list = await getHistory();
    if (list.length && list[0].query === q) return; // dedup vs last
    list.unshift({ query: q, ts: Date.now() });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    await set(KEY_HISTORY, list);
  }

  async function clearHistory() {
    await set(KEY_HISTORY, []);
  }

  async function getFavorites() {
    const arr = await get(KEY_FAVORITES, []);
    return Array.isArray(arr) ? arr : [];
  }

  async function addFavorite({ name, query }) {
    const q = (query || '').trim();
    if (!q) return null;
    const list = await getFavorites();
    const id = 'fav_' + Math.floor(performance.now() * 1000).toString(36) +
               '_' + list.length.toString(36);
    const item = {
      id,
      name: (name || q).trim().slice(0, 80),
      query: q,
      ts: Date.now()
    };
    list.unshift(item);
    await set(KEY_FAVORITES, list);
    return item;
  }

  async function removeFavorite(id) {
    const list = await getFavorites();
    const next = list.filter((f) => f.id !== id);
    await set(KEY_FAVORITES, next);
  }

  async function getLang() {
    const l = await get(KEY_LANG, null);
    return l === 'zh' || l === 'en' ? l : null;
  }

  async function setLang(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    await set(KEY_LANG, lang);
  }

  const NS = (window.XSF = window.XSF || {});
  NS.storage = {
    HISTORY_MAX,
    FAVORITES_SOFT_MAX,
    getHistory,
    pushHistory,
    clearHistory,
    getFavorites,
    addFavorite,
    removeFavorite,
    getLang,
    setLang
  };
})();
