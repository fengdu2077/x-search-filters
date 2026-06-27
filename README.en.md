# X Search Filters — Chrome Extension

[中文](./README.md)

A lightweight Chrome extension that adds a visual advanced-search panel to X (Twitter). It helps you build X search operators such as `from:`, `since:`, `min_faves:`, `filter:images`, `lang:ja`, and more without memorizing syntax.

## Features

- **Intent-based tabs:** Query / Source / Filters / Type
- **Native autocomplete remains intact:** clicking X's search box still shows X's own suggestions
- **Apply-only behavior:** editing filters does not overwrite X's search box until you click **Apply**
- **History & favorites:** save recent and named searches locally
- **EN / 中文 UI:** switch the extension interface language
- **No build step:** plain Manifest V3 JavaScript/CSS

## Install from GitHub

1. Click **Code → Download ZIP** on GitHub.
2. Unzip the file.
3. Open Chrome or Edge and go to:
   ```text
   chrome://extensions
   ```
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped project folder — the folder that directly contains `manifest.json`.
7. Open `https://x.com` and use the **Advanced / 高级搜索** button inside the search bar.

> **Avoid installing twice:** if you have already installed this extension from the Chrome Web Store, do not also load the GitHub version (and vice versa). Running two copies of the same extension at once can make the **Advanced** button stop responding after certain actions. Keep only one installed.

## Usage

```text
┌────────────────────────────────────────┐
│ X search box                           │
│                         [Advanced]     │
└────────────────────────────────────────┘
              │ click
              ▼
┌────────────────────────────────────────┐
│ Advanced Search          [⏱][★][✕]    │
├────────────────────────────────────────┤
│ 🔍 Keywords                            │
├────────────────────────────────────────┤
│ [Query][Source][Filters][Type] Lang:any│
├────────────────────────────────────────┤
│ Active tab fields                      │
├────────────────────────────────────────┤
│ query preview [Copy][Reset][Save][Apply]│
└────────────────────────────────────────┘
```

## Key behavior

- Clicking X's search box still shows X's native autocomplete.
- The extension opens only through the **Advanced / 高级搜索** button or `Ctrl+Shift+F` while the search box is focused.
- Editing fields updates only the panel preview.
- Clicking **Apply** clears X's search box, writes the final query, and submits through X's own search flow.
- Clicking **Reset** clears both the panel and X's search box, but does not submit.
- Clicking **Copy** copies the generated query.
- Clicking **Save** stores the current query as a favorite.

## Supported operators

| Tab | Operators |
| --- | --- |
| Query | keywords, `"exact phrase"`, `OR`, `-exclude`, `#hashtag`, `url:`, `lang:` |
| Source | `from:`, `to:`, `filter:verified`, `filter:follows`, `near:`, `within:` |
| Filters | `within_time:`, `since:`, `until:`, `min_faves:`, `min_retweets:`, `min_replies:` |
| Type | `filter:media`, `filter:images`, `filter:videos`, `filter:links`, `filter:quote`, `-filter:replies` |

## Project structure

```text
manifest.json          Manifest V3 config
icons/                 Extension icons
src/
  content.js           Search box detection + Advanced button injection
  panel.js             Advanced search panel
  panel.css            Panel styles
  operators.js         Operator metadata
  query-builder.js     Panel state → X search query
  react-input.js       Safe React-controlled input writer
  storage.js           History, favorites, and language storage
  i18n.js              EN / ZH strings
```

## Development notes

After editing files, reload the extension:

1. Open `chrome://extensions`.
2. Find **X Search Filters**.
3. Click the reload button on the extension card.
4. Refresh the X tab.

## Project notes

- This extension is distributed via GitHub and can be loaded as an unpacked extension in Chrome Developer Mode.
- It depends on the search-box DOM on X. If X changes its page structure, button detection or some interactions may break.
- If you run into issues, please open an issue. Pull requests are also welcome.

## Disclaimer

This project is an independent browser extension and is not affiliated with, endorsed by, or sponsored by X Corp. X/Twitter may change its DOM or search behavior at any time, which may break this extension.

## License

MIT
