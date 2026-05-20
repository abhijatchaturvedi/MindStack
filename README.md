# MindStack

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-147c72)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![No Build Step](https://img.shields.io/badge/Build-none-success)](#run-locally)
[![Storage](https://img.shields.io/badge/Storage-Chrome%20sync-c9772a)](https://developer.chrome.com/docs/extensions/reference/api/storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

MindStack is a professional Chrome extension for memory development. It captures knowledge from webpages, turns notes into reviewable memory cards, schedules resurfacing with spaced repetition, and provides a dashboard for library management and insights.

## Features

- MV3 Chrome extension with popup capture, context-menu capture, and keyboard shortcuts.
- Web dashboard with overview metrics, review queue, searchable library, tag insights, source intelligence, import/export, and settings.
- On-page resurfacing layer that reminds you of due memories while browsing.
- Spaced repetition scheduler with recall scoring for forgot, hard, good, and easy.
- Chrome storage-backed persistence with local fallback for browser testing.
- No build step and no dependency install required.

## Run locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the cloned or downloaded `MindStack` project folder.
5. Pin MindStack from the extension toolbar.

Open `dashboard.html` directly in a browser for UI review, or use the extension action after loading it.

## Keyboard shortcuts

- `Ctrl+Shift+M`: capture selected text.
- `Ctrl+Shift+K`: open the dashboard.

## Development checks

```powershell
npm run check
```

## License

MIT
