/* Build a valid X advanced-search query from panel state.
 * State shape (every field optional):
 *   {
 *     keywords:    string,
 *     exactPhrase: string,
 *     orTerms:     string,        // comma-separated
 *     exclude:     string,        // comma-separated
 *     hashtag:     string,        // no #
 *     cashtag:     string,        // no $
 *     force:       string,        // bare word
 *     from, to, mention: string,
 *     filterVerified, filterFollows: 'off'|'on',
 *     since, until:       'YYYY-MM-DD',
 *     withinTime:         { value: number, unit: 'd'|'h'|'m'|'s' },
 *     sinceTime, untilTime: number,
 *     minFaves, minRetweets, minReplies: number,
 *     maxFaves, maxRetweets, maxReplies: number,
 *     filterHasEngagement: 'off'|'on'|'exclude',
 *     filterMedia ... filterNativeRetweets: 'off'|'on',
 *     filterReplies:       'off'|'on', // on = -filter:replies
 *     lang:    'en'|'zh'|...|'',
 *     near:    string,
 *     within:  { value: number, unit: 'km'|'mi' },
 *     geocode: string,
 *     url, conversationId, quotedTweetId: string,
 *     filterQuote, cardPoll: 'off'|'on'
 *   }
 *
 * Output: a single-line query string. Returns "" for an empty state.
 * Also returns warnings the panel can surface to the user. */
(function () {
  /** Wrap value in quotes if it contains whitespace and is not already quoted. */
  function qIfNeeded(v) {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s) return '';
    if (/^".*"$/.test(s)) return s;
    return /\s/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
  }

  /** Split a comma-separated list, trim, drop empties. */
  function splitCSV(v) {
    if (!v) return [];
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isFiniteNum(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  /** Strict integer parse: returns null for non-integers or empty. */
  function toInt(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  /** Append a clause if `value` is non-empty after trim. */
  function pushOp(out, op, value) {
    if (value == null) return;
    const s = String(value).trim();
    if (!s) return;
    out.push(`${op}${qIfNeeded(s)}`);
  }

  function build(state) {
    const out = [];
    const warnings = [];
    const s = state || {};

    // 1. Free keywords (kept verbatim; user controls spacing)
    if (s.keywords && s.keywords.trim()) {
      out.push(s.keywords.trim());
    }

    // 2. Exact phrase
    if (s.exactPhrase && s.exactPhrase.trim()) {
      const p = s.exactPhrase.trim().replace(/^"|"$/g, '');
      out.push(`"${p}"`);
    }

    // 3. OR terms
    const ors = splitCSV(s.orTerms);
    if (ors.length >= 2) {
      out.push('(' + ors.map(qIfNeeded).join(' OR ') + ')');
    } else if (ors.length === 1) {
      out.push(qIfNeeded(ors[0]));
    }

    // 4. Exclusions
    splitCSV(s.exclude).forEach((term) => {
      out.push('-' + qIfNeeded(term));
    });

    // 5. Hashtag / cashtag / force-include
    if (s.hashtag && s.hashtag.trim()) {
      const h = s.hashtag.trim().replace(/^#/, '');
      out.push('#' + h);
    }
    if (s.cashtag && s.cashtag.trim()) {
      const c = s.cashtag.trim().replace(/^\$/, '');
      out.push('$' + c);
    }
    if (s.force && s.force.trim()) {
      out.push('+' + s.force.trim());
    }

    // 6. Users
    if (s.from)    pushOp(out, 'from:', s.from.trim().replace(/^@/, ''));
    if (s.to)      pushOp(out, 'to:',   s.to.trim().replace(/^@/, ''));
    if (s.mention) {
      const m = s.mention.trim().replace(/^@/, '');
      if (m) out.push('@' + m);
    }
    if (s.filterVerified === 'on') out.push('filter:verified');
    if (s.filterFollows  === 'on') out.push('filter:follows');

    // 7. Time — within_time overrides since/until per X behavior
    const hasWithin = s.withinTime && isFiniteNum(s.withinTime.value) && s.withinTime.value > 0;
    if (hasWithin) {
      if (s.since || s.until) {
        warnings.push('conflictTime');
      }
      const u = s.withinTime.unit || 'd';
      out.push(`within_time:${Math.trunc(s.withinTime.value)}${u}`);
    } else {
      if (s.since)  out.push(`since:${s.since}`);
      if (s.until)  out.push(`until:${s.until}`);
    }
    const st = toInt(s.sinceTime);
    if (st != null && st > 0) out.push(`since_time:${st}`);
    const ut = toInt(s.untilTime);
    if (ut != null && ut > 0) out.push(`until_time:${ut}`);

    // 8. Engagement min / max
    const minPairs = [
      ['minFaves',    'min_faves'],
      ['minRetweets', 'min_retweets'],
      ['minReplies',  'min_replies']
    ];
    for (const [k, op] of minPairs) {
      const n = toInt(s[k]);
      if (n != null && n >= 0) out.push(`${op}:${n}`);
    }
    const maxPairs = [
      ['maxFaves',    'min_faves'],
      ['maxRetweets', 'min_retweets'],
      ['maxReplies',  'min_replies']
    ];
    for (const [k, op] of maxPairs) {
      const n = toInt(s[k]);
      if (n != null && n >= 0) out.push(`-${op}:${n + 1}`); // upper bound: NOT >= n+1
    }
    if (s.filterHasEngagement === 'on')      out.push('filter:has_engagement');
    if (s.filterHasEngagement === 'exclude') out.push('-filter:has_engagement');

    // 9. Media filters
    const mediaBools = [
      ['filterMedia',          'filter:media'],
      ['filterImages',         'filter:images'],
      ['filterVideos',         'filter:videos'],
      ['filterTwimg',          'filter:twimg'],
      ['filterNativeVideo',    'filter:native_video'],
      ['filterSpaces',         'filter:spaces'],
      ['filterLinks',          'filter:links'],
      ['filterNews',           'filter:news'],
      ['filterNativeRetweets', 'filter:nativeretweets']
    ];
    for (const [k, op] of mediaBools) {
      if (s[k] === 'on') out.push(op);
    }
    if (s.filterReplies === 'on') out.push('-filter:replies');

    // 10. Language & location
    if (s.lang) out.push(`lang:${s.lang}`);
    if (s.near) {
      pushOp(out, 'near:', s.near.trim());
      if (s.within && isFiniteNum(s.within.value) && s.within.value > 0) {
        const u = s.within.unit === 'mi' ? 'mi' : 'km';
        out.push(`within:${Math.trunc(s.within.value)}${u}`);
      }
    }
    if (s.geocode && s.geocode.trim()) {
      out.push(`geocode:${s.geocode.trim()}`);
    }

    // 11. Advanced
    if (s.url)            pushOp(out, 'url:', s.url.trim());
    if (s.conversationId) pushOp(out, 'conversation_id:', s.conversationId.trim());
    if (s.quotedTweetId)  pushOp(out, 'quoted_tweet_id:',  s.quotedTweetId.trim());
    if (s.filterQuote === 'on') out.push('filter:quote');
    if (s.cardPoll    === 'on') out.push('card_name:poll*');

    return { query: out.join(' ').trim(), warnings };
  }

  const NS = (window.XSF = window.XSF || {});
  NS.queryBuilder = { build };
})();
