/* Single source of truth for X advanced search operators.
 * v0.5 groups the 80/20 field set by user intent:
 *   Query   — what to search for
 *   Source  — who/where it comes from
 *   Filters — time and engagement constraints
 *   Type    — tweet/content type
 */
(function () {
  /** Categories displayed as compact tabs in order. */
  const CATEGORIES = [
    'query',
    'source',
    'filters',
    'type'
  ];

  /* Field types understood by panel.js:
   *   text       — single text input
   *   number     — numeric input
   *   date       — <input type="date">
   *   bool       — checkbox/chip; value 'on' / 'off'
   *   select     — dropdown from valueOptions
   *   withinTime — paired number + unit selector (d/h/m/s)
   *   within     — paired number + unit (km/mi)
   */
  const FIELDS = [
    // --- QUERY: what to search for ---
    { key: 'exactPhrase', category: 'query', type: 'text', labelKey: 'exactPhrase', hintKey: 'exactPhrase' },
    { key: 'orTerms',     category: 'query', type: 'text', labelKey: 'orTerms',     hintKey: 'orTerms' },
    { key: 'exclude',     category: 'query', type: 'text', labelKey: 'exclude',     hintKey: 'exclude' },
    { key: 'hashtag',     category: 'query', type: 'text', labelKey: 'hashtag' },
    { key: 'url',         category: 'query', type: 'text', labelKey: 'url', hintKey: 'url' },
    {
      key: 'lang', category: 'query', type: 'select', labelKey: 'lang',
      valueOptions: [
        { value: '',   labelKey: 'langs.any' },
        { value: 'en', labelKey: 'langs.en' },
        { value: 'zh', labelKey: 'langs.zh' },
        { value: 'ja', labelKey: 'langs.ja' },
        { value: 'ko', labelKey: 'langs.ko' },
        { value: 'es', labelKey: 'langs.es' },
        { value: 'fr', labelKey: 'langs.fr' },
        { value: 'de', labelKey: 'langs.de' },
        { value: 'ru', labelKey: 'langs.ru' },
        { value: 'pt', labelKey: 'langs.pt' },
        { value: 'ar', labelKey: 'langs.ar' },
        { value: 'hi', labelKey: 'langs.hi' }
      ]
    },

    // --- SOURCE: people/account scope/location ---
    { key: 'from', category: 'source', type: 'text', labelKey: 'from', hintKey: 'from' },
    { key: 'to',   category: 'source', type: 'text', labelKey: 'to',   hintKey: 'from' },
    { key: 'filterVerified', category: 'source', type: 'bool', labelKey: 'filterVerified' },
    { key: 'filterFollows',  category: 'source', type: 'bool', labelKey: 'filterFollows' },
    { key: 'near',           category: 'source', type: 'text',   labelKey: 'near', hintKey: 'near' },
    { key: 'within',         category: 'source', type: 'within', labelKey: 'within', hintKey: 'within' },

    // --- FILTERS: time and engagement ---
    { key: 'withinTime', category: 'filters', type: 'withinTime', labelKey: 'withinTime', hintKey: 'withinTime' },
    { key: 'since',      category: 'filters', type: 'date',       labelKey: 'since' },
    { key: 'until',      category: 'filters', type: 'date',       labelKey: 'until' },
    { key: 'minFaves',    category: 'filters', type: 'number', labelKey: 'minFaves' },
    { key: 'minRetweets', category: 'filters', type: 'number', labelKey: 'minRetweets' },
    { key: 'minReplies',  category: 'filters', type: 'number', labelKey: 'minReplies' },

    // --- TYPE: media/content type ---
    // filterMedia (any media), filterImages, filterVideos are mutually
    // exclusive on X (image-only and video-only can't coexist, and "any
    // media" is the superset). Exposed as a single radio field whose value
    // is '' (any/off) | 'media' | 'images' | 'videos'.
    { key: 'radioMedia', category: 'type', type: 'radioMedia', labelKey: 'mediaGroup' },
    { key: 'filterLinks',   category: 'type', type: 'bool', labelKey: 'filterLinks' },
    { key: 'filterQuote',   category: 'type', type: 'bool', labelKey: 'filterQuote' },
    { key: 'filterReplies', category: 'type', type: 'bool', labelKey: 'excludeReplies' }
  ];

  const NS = (window.XSF = window.XSF || {});
  NS.operators = { CATEGORIES, FIELDS };
})();
