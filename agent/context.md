# Session Context — Guide Creator Chrome Extension

## Session Date
2026-03-12

## What Was Done

### Bug Fixes in `src/background/background.js`

Two bugs were identified and fixed:

#### Bug 1 — Screenshots not captured on click
- **Cause**: `chrome.tabs.captureVisibleTab(null, { format: 'png' }, callback)` — `null` as the window ID is unreliable in MV3 service workers because the service worker has no intrinsic "current window" context.
- **Fix**: Changed to `chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, callback)`, using the window ID from the message sender (the content script's tab).

#### Bug 2 — PDF named 'guide' instead of webpage title
- **Cause**: `STOP_RECORDING` used `chrome.tabs.query({ active: true, currentWindow: true })` which returns an empty array when the popup is open, because the popup may be treated as the "current window" (which has no regular tabs), causing `pageTitle` to default to `'guide'`.
- **Fix**:
  - Added `let recordingTabId = null` to module scope.
  - Stored `tabs[0].id` into `recordingTabId` during `START_RECORDING` (when the correct browser window IS current).
  - In `STOP_RECORDING`, replaced `tabs.query` with `chrome.tabs.get(recordingTabId)` for reliable title retrieval.
  - Added a fallback using `lastFocusedWindow: true` query if `recordingTabId` is somehow null.

### CLAUDE.md Initialized
Created `/Users/jerry/workspace/guide-creator/CLAUDE.md` documenting:
- Project description and user workflow
- Three-context architecture (Popup ↔ Background ↔ Content)
- File reference table
- Message actions reference table
- Step data shapes
- Key implementation notes (including both bug fixes)
- Chrome loading instructions
- Permissions explanation
- Coding conventions (no build step, no new external deps, don't modify vendored jsPDF)

## Architecture Summary

```
Popup (popup.js)
  ↕ chrome.runtime.sendMessage
Background Service Worker (background.js)
  ↕ chrome.tabs.sendMessage
Content Script (content.js)
```

### Key State in background.js
- `isRecording` — boolean session flag
- `recordingSteps` — array of captured step objects
- `recordingTabId` — tab ID stored at START_RECORDING to reliably retrieve page title at STOP_RECORDING

### Step Data Shapes
```js
// Click step (has screenshot)
{ type: 'click', text, target, clientX, clientY, screenshot, timestamp }

// Scroll step
{ type: 'scroll', text, direction, scrollY, timestamp }

// Input step
{ type: 'input', text, value, selector, timestamp }
```

## Files Modified
- `src/background/background.js` — two bug fixes (captureVisibleTab windowId, recordingTabId tracking)
- `CLAUDE.md` — created from scratch as project reference

## Files Read (no changes)
- `src/content/content.js`
- `src/popup/popup.js`
- `manifest.json`
- `package.json`
