# Guide Creator — Chrome Extension

A Manifest V3 Chrome extension that records user interactions on any webpage and exports them as a step-by-step PDF guide with annotated screenshots. Operates entirely locally — no backend, no build step required.

## What It Does

1. User opens the popup and clicks **Start Recording**
2. User performs actions on the page (clicks, scrolls, typing)
3. User opens the popup and clicks **Stop Recording**
4. User optionally edits the guide title
5. User clicks **Generate PDF** — a formatted PDF is downloaded, named after the recorded webpage title

## Architecture

Three isolated contexts communicate via Chrome's message-passing API:

```
Popup (popup.js)
  ↕ chrome.runtime.sendMessage
Background Service Worker (background.js)
  ↕ chrome.tabs.sendMessage / chrome.scripting.executeScript
Content Script (content.js)
```

### Files

| File | Role |
|---|---|
| `manifest.json` | Extension config — MV3, permissions, entry points |
| `src/background/background.js` | Service worker — state management, screenshot capture, step storage, tab tracking |
| `src/content/content.js` | Content script — event listeners (click, scroll, input), CSS selector generation, visual ripple feedback |
| `src/content/content.css` | Styles for click ripple animation and highlight overlays |
| `src/popup/popup.html` | Popup UI markup |
| `src/popup/popup.js` | Popup logic — start/stop controls, title editing, PDF generation via jsPDF |
| `src/popup/popup.css` | Popup styles |
| `src/lib/jspdf.umd.min.js` | Vendored jsPDF library (never modify) |
| `test/setup.js` | Jest test setup — initializes jest-chrome mock globals |
| `test/background.test.js` | Unit tests for background service worker |
| `test/content.test.js` | Unit tests for content script |
| `jest.config.js` | Jest configuration — jsdom environment, auto-clear mocks |
| `package.json` | Dev dependencies: jest, jest-chrome, jest-environment-jsdom, jsdom |

---

## Message Actions

| Action | Flow | Purpose |
|---|---|---|
| `START_RECORDING` | Popup → Background → Content | Initiates session, sets badge `REC` (red), activates DOM listeners |
| `STOP_RECORDING` | Popup → Background → Content | Ends session, captures final screenshot, waits for pending screenshots, returns steps + page title |
| `GET_STATUS` | Popup/Content → Background | Retrieves `isRecording` and `recordingSteps` from storage |
| `CAPTURE_CLICK_STEP` | Content → Background | Requests `captureVisibleTab` screenshot for a click event |
| `RECORD_STEP` | Content → Background | Stores a scroll or input step (no screenshot) |
| `CLEAR_SESSION` | Popup → Background | Clears all `chrome.storage.local` after PDF download |
| `PING` | Background → Content | Verifies content script is injected and active (expects `PONG` response) |

---

## Step Data Shape

```js
// Click step (has screenshot)
{
  type: 'click',
  text: 'Click on "Button Text"',
  target: { tagName, id, className, innerText, selector },
  clientX: number,       // viewport X coordinate at time of click
  clientY: number,       // viewport Y coordinate at time of click
  windowWidth: number,   // viewport width — used for PDF click overlay ratio
  windowHeight: number,  // viewport height — used for PDF click overlay ratio
  screenshot: 'data:image/jpeg;base64,...' | null,
  timestamp: number      // Date.now()
}

// Scroll step (no screenshot)
{
  type: 'scroll',
  text: 'User scroll down',
  direction: 'scroll down' | 'scroll up' | 'scroll',
  scrollY: number,
  timestamp: number
}

// Input step (no screenshot)
{
  type: 'input',
  text: 'Typed "hello world"',
  value: 'hello world',
  selector: 'body > div > input',
  timestamp: number
}

// Final step (captured on stop recording)
{
  type: 'final',
  text: 'Final result',
  screenshot: 'data:image/jpeg;base64,...' | null,
  timestamp: number
}
```

---

## Background Service Worker (`src/background/background.js`)

### State Management
- All state is persisted in `chrome.storage.local` after every action:
  - `isRecording` (boolean)
  - `recordingTabId` (number) — tab ID where recording is active
  - `recordingSteps` (array) — accumulated steps
- A module-level `pendingScreenshots` counter tracks in-flight async screenshot operations.

### Message Handlers

**`START_RECORDING`**
- Accepts optional `resetSteps` flag (boolean) — when `true`, clears `recordingSteps` before starting (used for fresh sessions); when `false`/omitted, preserves existing steps (used for tab reload resume).
- Queries the active tab (`chrome.tabs.query({ active: true, currentWindow: true })`).
- Stores `recordingTabId` in storage.
- Pings the content script via `chrome.tabs.sendMessage` with `PING`. If no response (script not injected), falls back to `chrome.scripting.executeScript` to inject `content.js` and `content.css` dynamically.
- Sets the extension badge: text `REC`, background color `#FF0000`.
- Sets `isRecording: true` in storage.
- Sends `START_RECORDING` to the content script.

**`STOP_RECORDING`**
- Sends `STOP_RECORDING` to the content script.
- Captures a final screenshot via `captureVisibleTab`.
- Waits for `pendingScreenshots` to reach 0 (polls every 100ms) before resolving.
- Retrieves the page title via `chrome.tabs.get(recordingTabId)`.
- Appends a `final` step with the screenshot.
- Returns `{ stopped: true, steps, pageTitle }` to the popup.
- Clears the badge and sets `isRecording: false`.

**`CAPTURE_CLICK_STEP`**
- Increments `pendingScreenshots` counter.
- Calls `chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 50 })`.
  - **Must use `sender.tab.windowId`**, not `null` — MV3 service workers cannot rely on a "current window".
  - JPEG quality 50 keeps file sizes manageable.
- Appends step data (with screenshot) to `recordingSteps` in storage.
- Decrements `pendingScreenshots` after storage write.

**`RECORD_STEP`**
- Reads current `recordingSteps` from storage, appends the new step, writes back.

**`GET_STATUS`**
- Returns `{ isRecording, recordingSteps }` from storage.

**`CLEAR_SESSION`**
- Calls `chrome.storage.local.clear()`.

### Tab Navigation Handling
- `chrome.tabs.onUpdated` listener fires when a tab finishes loading (`status === 'complete'`).
- If the updated tab matches `recordingTabId` and `isRecording` is true, the background re-injects the content script and resumes recording (sends `START_RECORDING` with `resetSteps: false`).
- This enables **multi-page recording** across navigations and page refreshes.

---

## Content Script (`src/content/content.js`)

### Initialization
- On load, sends `GET_STATUS` to background to sync the local `isRecording` variable.

### Event Listeners (active only when `isRecording === true`)

**Click Events** (immediate, with 50ms screenshot delay)
- Appends a red ripple circle (`guide-creator-click-circle`) to `document.body` at click coordinates. Removed after 1000ms.
- Builds `target` object from the clicked element: `tagName`, `id`, `className`, `innerText` (trimmed, truncated), CSS selector via `getCssSelector()`.
- Sends `CAPTURE_CLICK_STEP` to background with: `text`, `target`, `clientX`, `clientY`, `windowWidth` (`window.innerWidth`), `windowHeight` (`window.innerHeight`).
- Note: Screenshot is triggered in the background 50ms after the message, allowing the ripple animation to render first.

**Scroll Events** (500ms debounce)
- Tracks `lastScrollY` (initialized to `window.scrollY` on load).
- Only records if movement > 20px to filter micro-scrolls.
- Computes direction based on `window.scrollY` vs `lastScrollY`.
- Sends `RECORD_STEP` with type `scroll`.

**Input Events** (1000ms debounce, `<input>` and `<textarea>` only)
- Fires on `input` events, debounced to capture the final value after typing stops.
- Sends `RECORD_STEP` with type `input`, capturing `value` and `selector`.

### `getCssSelector(el)`
- Walks up the DOM to build a unique CSS selector path.
- If element has an `id`, stops and uses `#id`.
- Otherwise builds `tagname:nth-of-type(n)` chain up to `body`.

### Message Listener
- `PING` → responds `{ pong: true }` (used by background to verify injection).
- `START_RECORDING` → sets `isRecording = true`.
- `STOP_RECORDING` → sets `isRecording = false`.

---

## Popup (`src/popup/popup.js`)

### Initialization
- On `DOMContentLoaded`, sends `GET_STATUS` to background and syncs the UI (button visibility, status text).

### Flow

1. **Start Recording**: Sends `START_RECORDING`, shows Stop button, hides Start button, sets status text.
2. **Stop Recording**: Sends `STOP_RECORDING`, hides both buttons, shows title input pre-filled with the page title from response, stores `currentSteps` and `currentPageTitle`.
3. **Generate PDF**: Calls `generatePDF(currentSteps, finalTitle)`, shows "Generating PDF...", then on completion sends `CLEAR_SESSION` and resets UI.

### PDF Generation (`generatePDF`)

**Document Setup**
- Creates `jsPDF` instance (A4, portrait, pt units).
- Helvetica font throughout (no custom font loading needed).
- Title: 22pt bold, rendered at top of page.

**Per-Step Layout**
- **Step box**: Light blue background `rgb(238, 243, 248)`, rounded corners (2pt radius), full width with 20pt side margins.
- **Step number circle**: White filled circle, step number centered inside at 11pt bold Helvetica.
- **Step text**: 12pt regular Helvetica, offset 20pt from the circle.
- **Screenshot** (when present):
  - Rendered below the step box.
  - Border: 0.5pt, color `#778899` (slate gray).
  - Image format: JPEG, added with `'FAST'` compression mode.
  - **Dynamic height calculation**: Loads the image in a temporary `<img>` element to get `naturalWidth`/`naturalHeight`, calculates `aspectRatio = naturalHeight / naturalWidth`, then `imageHeight = imageWidth * aspectRatio`. Fallback: 9:16 portrait ratio if image fails to load.
  - **Click indicator** (click steps only):
    - Calculates relative position: `ratioX = clientX / windowWidth`, `ratioY = clientY / windowHeight`.
    - Draws a filled semi-transparent circle (`#DA70D6` orchid/magenta, opacity 0.3) at the scaled position on the PDF image.
    - Circle radius: 6pt.

**Page Management**
- Before adding each step, checks if content would exceed y=280pt (bottom threshold).
- If so, calls `doc.addPage()` and resets y-cursor.

**Filename**
- `pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf'`
- Example: "My Dashboard — Acme Corp" → `my_dashboard___acme_corp.pdf`

---

## UI / Styles

### Colors
| Usage | Value |
|---|---|
| Primary (header, buttons, focus) | `#2c64e3` |
| Stop/secondary button | `#e53935` |
| Click ripple border | `#E53935` |
| Click ripple fill | `rgba(229, 57, 53, 0.4)` |
| PDF step box background | `rgb(238, 243, 248)` |
| PDF screenshot border | `#778899` |
| PDF click dot | `#DA70D6` (orchid) |

### Popup Dimensions
- Body width: 300px fixed.
- Buttons: 100% width, 10px padding, 6px border radius.

### CSS Animations
- `.guide-creator-click-circle`: `guide-creator-ripple` keyframe — scales from 0 to 3 over 0.8s with opacity fade. z-index: `2147483647` (max safe).

---

## Testing

**Stack**: Jest 30, jest-chrome (Chrome API mocks), jest-environment-jsdom, jsdom.

**`jest.config.js`**:
- `testEnvironment: 'jsdom'`
- `setupFilesAfterFramework: ['./test/setup.js']`
- `clearMocks: true`, `restoreMocks: true`

**`test/setup.js`**: Imports jest-chrome to initialize `global.chrome` mocks.

### `test/background.test.js`
- Mocks `chrome.storage.local.get/set/clear`, `chrome.tabs.query/get/sendMessage`, `chrome.tabs.captureVisibleTab`.
- Tests: GET_STATUS, CLEAR_SESSION, RECORD_STEP, START_RECORDING (with content script ping, injection fallback, badge update), STOP_RECORDING (final screenshot, pending screenshot wait, page title retrieval).

### `test/content.test.js`
- Uses `jest.useFakeTimers()` to control debounce timing.
- Tests: PING/PONG, start/stop message handling, click listener (ripple creation, CAPTURE_CLICK_STEP dispatch, 50ms delay, no-op when not recording), scroll debounce + direction detection + 20px threshold, input debounce + selector capture + textarea/input filter.

---

## Key Design Decisions

1. **`sender.tab.windowId` for screenshots**: MV3 service workers cannot use `null` as the window argument to `captureVisibleTab` — it must be the explicit window ID from the sender tab context.

2. **`recordingTabId` tracking**: Stored in background to reliably retrieve the page title on stop. Without it, `chrome.tabs.query({ active: true })` would return the popup window, not the recorded page.

3. **`chrome.storage.local` for all state**: Survives service worker termination (Chrome aggressively spins down idle service workers). Enables multi-page recording because state outlives any single page load.

4. **`pendingScreenshots` counter**: `STOP_RECORDING` must wait for all in-flight `captureVisibleTab` calls to complete before finalizing the guide. A simple async counter solves race conditions without complex promise chaining.

5. **Content script re-injection on navigation**: `chrome.tabs.onUpdated` re-injects `content.js`/`content.css` on `status === 'complete'` for `recordingTabId`, resuming seamlessly with `resetSteps: false`.

6. **PING/PONG injection verification**: Before sending `START_RECORDING` to the content script, background pings it. Lack of response means the script isn't present — triggers dynamic injection via `chrome.scripting.executeScript`.

7. **50ms click screenshot delay**: Allows the red ripple CSS animation to render before `captureVisibleTab` fires, so the screenshot shows the visual feedback.

8. **Click overlay via ratio math**: Coordinates are stored as raw viewport pixels at capture time. During PDF generation, they're converted to ratios (`clientX / windowWidth`) and scaled to the rendered image dimensions. This decouples capture from rendering.

9. **JPEG quality 50**: Balances screenshot legibility against storage size and PDF file size. Screenshots are stored in `chrome.storage.local` (unlimited storage permission).

10. **PDF generation in popup**: Keeps the background service worker lightweight — no heavy jsPDF dependency loaded in the service worker context.

11. **No build step**: Vanilla JS/HTML/CSS for the extension. Jest is a dev-only toolchain for tests and does not affect the loadable extension.

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Access to the current active tab for recording |
| `scripting` | Dynamic content script injection via `chrome.scripting.executeScript` |
| `storage` | `chrome.storage.local` for recording state persistence |
| `unlimitedStorage` | Screenshots (base64 JPEG) can exceed the default 5MB quota |
| `<all_urls>` (host) | `captureVisibleTab` requires host permissions for any site being recorded |

---

## Loading the Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repo root

## Running Tests

```bash
npm test
```

---

## Conventions

- No build tooling — keep it vanilla JS/HTML/CSS
- Do not add external dependencies; bundle any new libs into `src/lib/`
- Keep `manifest.json` at the repo root (Chrome requires this)
- `jspdf.umd.min.js` is a vendored file — never modify it
- All state must go through `chrome.storage.local` (not in-memory module variables) to survive service worker restarts
