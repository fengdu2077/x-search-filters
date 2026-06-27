# Changelog

## 0.6.0

- Fix the Advanced button becoming unresponsive after a search or language
  switch. The trigger button is now a singleton that survives X rebuilding the
  search box, and it re-resolves the search input live on each click instead
  of trusting a stale reference. (Previously the button could be destroyed
  between pointerdown and pointerup, swallowing the click.)
- Namespace each trigger button by instance so two installed copies of the
  extension no longer delete each other's button via their MutationObservers.
- When the search box can't be found, the panel now centers on screen instead
  of silently staying off-screen (so a click always produces a visible panel).
- Switching the UI language in the panel now updates the Advanced button label
  (Advanced ⇄ 高级搜索) immediately, without a page reload.
- History entries now show when the search was run (local YYYY-MM-DD HH:MM).
  Each history item is now two rows — the query on its own row with a clean
  ellipsis, and the timestamp + Use button on a meta row below — so the time
  never squeezes long queries.
- The Advanced button now overlays long search-bar text with an opaque,
  theme-matched background (plus a subtle blur), so it stays clearly visible
  and clickable even when the search bar is full of text. The user's input is
  never truncated.
- Fix search conditions snowballing on each reopen. The panel no longer
  reads the search bar back into itself; it keeps the last structured state
  (from, dates, min_faves, …) so you can reopen and keep tweaking. Repeatedly
  opening Advanced Search no longer stacks the previous query on top of the
  existing filters. The search bar is left untouched on open; click Reset to
  start fresh.
- In the Type tab, "Any media / Images / Videos" are now a single
  mutually-exclusive group (pick one; click it again to clear). Previously
  they were independent toggles, so selecting both Images and Videos produced
  `filter:images filter:videos`, which matches nothing on X. Links / Quote /
  Exclude-replies remain independent toggles on a second row.

## 0.5.7

- Redesign the extension icon (16 / 48 / 128).
- Re-scan on any DOM mutation so the Advanced button survives in-tab navigations on X.

## 0.5.5

- Broaden search box detection for X profile pages and localized search inputs.
- Add delayed low-cost scans after SPA route changes.
- Keep the Advanced button bound only to visible usable search inputs.

## 0.5.x

- Regroup fields into Query / Source / Filters / Type.
- Move `lang:` to the tab row as a compact global search-language filter.
- Compact Query, Source, and Filters layouts to reduce scrolling.
- Move UI language switch to the header.
- Remove duplicate top query preview; keep footer preview + Copy.

## 0.4.x

- Simplify the field set to common 80/20 operators.
- Replace replies tri-state with a single Exclude replies chip.
- Improve Apply/Reset behavior and trigger lifecycle.

## 0.3.x

- Switch to explicit trigger model: Advanced button + shortcut.
- Stop writing to X's search box while editing filters.

## 0.2.x

- Introduce compact tabbed UI.

## 0.1.x

- Initial prototype with Shadow-DOM panel, history, favorites, and EN/ZH UI.
