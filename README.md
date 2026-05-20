# MindStack

[Chrome Extension](https://developer.chrome.com/docs/extensions/)
[Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[No Build Step](#run-locally)
[Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
[License: MIT](#license)

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

- `Ctrl+Shift+Y`: capture selected text.
- `Ctrl+Shift+L`: save the current webpage.
- `Ctrl+Shift+U`: open the dashboard.

You can customize shortcuts from `chrome://extensions/shortcuts` after loading the extension.

If a shortcut does not fire, open `chrome://extensions/shortcuts` and make sure MindStack is assigned there. Chrome sometimes keeps unpacked extension shortcuts as **Not set** after reloads or when another extension/browser command already uses the same keys.

## Development checks

```powershell
npm run check
```

## License

MIT
