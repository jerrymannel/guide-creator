# Guide Creator — Chrome Extension

A Chrome extension (Manifest v3) that records user interactions on any webpage and exports them as a step-by-step PDF guide with annotated screenshots.

## What It Does

1. User opens the popup and clicks **Start Recording**
2. User performs actions on the page (clicks, scrolls, typing)
3. User opens the popup and clicks **Stop Recording**
4. A PDF is auto-generated and downloaded, named after the recorded webpage's title

## Architecture

Three isolated contexts communicate via Chrome's message-passing API:

```
Popup (popup.js)
  ↕ chrome.runtime.sendMessage
Background Service Worker (background.js)
  ↕ chrome.tabs.sendMessage
Content Script (content.js)
```

### Files

| File | Role |
|---|---|
| `manifest.json` | Extension config — MV3, permissions, entry points |
| `src/background/background.js` | Service worker — state management, screenshot capture, step storage |
| `src/content/content.js` | Content script — event listeners (click, scroll, input), visual ripple feedback |
| `src/content/content.css` | Styles for click ripple animation and highlight overlays |
| `src/popup/popup.html` | Popup UI markup |
| `src/popup/popup.js` | Popup logic — start/stop controls, PDF generation via jsPDF |
| `src/popup/popup.css` | Popup styles |
| `src/lib/jspdf.umd.min.js` | Bundled jsPDF library (do not modify) |

### Message Actions

| Action | Sender → Receiver | Purpose |
|---|---|---|
| `START_RECORDING` | Popup → Background → Content | Begin session, set badge, enable listeners |
| `STOP_RECORDING` | Popup → Background → Content | End session, collect steps + page title |
| `CAPTURE_CLICK_STEP` | Content → Background | Trigger `captureVisibleTab`, store step with screenshot |
| `RECORD_STEP` | Content → Background | Store scroll/input steps (no screenshot) |
| `GET_STATUS` | Popup → Background | Sync UI state on popup open |

### Step Data Shape

```js
// Click step (has screenshot)
{ type: 'click', text, target, clientX, clientY, screenshot, timestamp }

// Scroll step
{ type: 'scroll', text, direction, scrollY, timestamp }

// Input step
{ type: 'input', text, value, selector, timestamp }
```

## Key Implementation Notes

- **Screenshot capture**: `chrome.tabs.captureVisibleTab(sender.tab.windowId, ...)` — must use `sender.tab.windowId`, not `null`, in MV3 service workers.
- **Recording tab tracking**: `recordingTabId` is stored in `background.js` when `START_RECORDING` runs, so `STOP_RECORDING` can reliably call `chrome.tabs.get(recordingTabId)` for the page title — avoids `currentWindow` misidentifying the popup window as the active window.
- **PDF naming**: Page title from the recorded tab is sanitized (`/[^a-z0-9]/gi → '_'`) to form the filename.
- **Debouncing**: Scroll events debounce at 500ms; input events at 1000ms.
- **Click feedback**: A red ripple circle (`guide-creator-click-circle`) is appended to the DOM on each recorded click, then removed after 1s.
- **No build step**: Plain JavaScript — load unpacked directly in Chrome via `chrome://extensions`.

## Loading the Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this repo root

## Permissions

- `activeTab` — access to the currently active tab
- `scripting` — inject content scripts programmatically if needed
- `storage` — reserved for future use
- `<all_urls>` (host permission) — required for `captureVisibleTab` on any site

## Conventions

- No build tooling — keep it vanilla JS/HTML/CSS
- Do not add external dependencies; bundle any new libs into `src/lib/`
- Keep `manifest.json` at the repo root (Chrome requires this)
- `jspdf.umd.min.js` is a vendored file — never modify it
