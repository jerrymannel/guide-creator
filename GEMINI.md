# Guide Creator - Project Context (GEMINI.md)

This document provides a comprehensive overview of the Guide Creator project, including its features, technical architecture, and key design decisions. It serves as context for AI agents working on this repository.

## 1. Project Overview

**Guide Creator** is a Manifest V3 (MV3) Chrome Extension designed to seamlessly record user interactions (clicks, scrolls, typing) across web pages and automatically generate a step-by-step PDF guide complete with annotated screenshots.

The extension operates entirely locally within the browser, requiring no backend services, and avoids complex build steps for its core functionality.

## 2. Core Features

*   **One-Click Recording**: Users can start and stop recording sessions via the extension popup.
*   **Multi-Page Support**: Recording state seamlessly persists across page navigations and refreshes, allowing guides to span multiple pages.
*   **Interaction Tracking**:
    *   **Clicks**: Captures exact click coordinates, the target element's text/selector, and triggers a screenshot.
    *   **Typing**: Captures text input in `input` and `textarea` fields (debounced).
    *   **Scrolling**: Detects vertical scroll direction (up/down) and distance (debounced).
*   **Visual Feedback**:
    *   Injects a temporary red "ripple" animation on the page where the user clicks.
    *   Popup badge shows `REC` with a red background while active.
*   **PDF Generation**:
    *   Compiles recorded steps into a styled, structured PDF document using `jsPDF`.
    *   Automatically formats steps with clean backgrounds, step numbers in circles, and precise click annotations (red circles overlaid on screenshots based on relative viewport coordinates).
    *   Includes a final screenshot of the page when recording is stopped.
*   **Automated Testing**: Includes unit tests for the background service worker using Jest and `jest-chrome`.

## 3. Architecture & Technical Details

The extension follows a standard Chrome MV3 architecture with three primary contexts communicating via message passing:

1.  **Popup (`src/popup/popup.html`, `popup.js`)**:
    *   Handles user interface (Start/Stop, Title input).
    *   Queries `background.js` for current state upon opening (`GET_STATUS`).
    *   Executes PDF generation using the vendored `jspdf.umd.min.js`.
2.  **Background Service Worker (`src/background/background.js`)**:
    *   **State Management**: Uses `chrome.storage.local` to store `isRecording`, `recordingTabId`, and `recordingSteps`. This ensures state survives service worker termination.
    *   **Tab Tracking**: Listens to `chrome.tabs.onUpdated` to automatically inject the content script and resume recording if the user navigates or refreshes the tracked tab.
    *   **Screenshot Orchestration**: Takes screenshots via `chrome.tabs.captureVisibleTab()`. It deliberately tracks `pendingScreenshots` to ensure all async screenshot operations complete before finalizing a guide.
3.  **Content Script (`src/content/content.js`)**:
    *   Injected into target pages to attach DOM event listeners (`click`, `scroll`, `input`).
    *   Syncs its local `isRecording` variable with the background on load.
    *   Extracts critical element context using a custom CSS selector generator (`getCssSelector`).

### Message Passing API

| Action | Flow | Purpose |
| :--- | :--- | :--- |
| `START_RECORDING` | Popup -> Background -> Content | Initiates session, sets badge, activates DOM listeners. |
| `STOP_RECORDING` | Popup -> Background -> Content | Ends session, waits for pending screenshots, returns steps. |
| `GET_STATUS` | Popup/Content -> Background | Retrieves current recording status from storage. |
| `CAPTURE_CLICK_STEP` | Content -> Background | Requests a screenshot from the background context for a click. |
| `RECORD_STEP` | Content -> Background | Stores a non-screenshot step (scroll, type). |
| `CLEAR_SESSION` | Popup -> Background | Clears storage after PDF download or reset. |
| `PING` | Background -> Content | Verifies if content script is injected and active. |

## 4. Key Design Decisions

1.  **MV3 Service Worker Constraints Handling**: 
    Because MV3 service workers cannot access the DOM or directly capture the current window reliably without tab context, `background.js` explicitly stores `recordingTabId` and passes `sender.tab.windowId` to `captureVisibleTab`.
2.  **Storage for Persistence**: 
    Recording steps and state are saved in `chrome.storage.local` after every action. This design decision directly solves the problem of Chrome aggressively spinning down the background service worker during inactivity, and supports the multi-page recording feature.
3.  **Content Script Re-injection**:
    Instead of relying solely on manifest injection, `background.js` intercepts page loads (`chrome.tabs.onUpdated`) and uses `chrome.scripting.executeScript` to dynamically inject `content.js` and `content.css` if missing, ensuring uninterrupted recording.
4.  **Debouncing Events**:
    *   `scroll` is debounced by **500ms** to group continuous scrolling into a single step.
    *   `input` is debounced by **1000ms** to capture complete phrases/words rather than individual keystrokes.
    *   `click` screenshot capture is delayed by **50ms** to allow the injected CSS ripple animation to render before snapping the picture.
5.  **Click Overlay Coordination**:
    Instead of permanently modifying the DOM for screenshots, the extension records the `clientX`, `clientY`, `windowWidth`, and `windowHeight` during a click. During PDF generation, it calculates the relative ratio and draws a matching circle over the screenshot image on the PDF canvas.
6.  **No Build Step / Vanilla JS**:
    The core extension operates without Webpack, Babel, or other bundlers. Third-party libraries (`jsPDF`) are vendored directly in `src/lib/`. The exception is the test suite, which relies on standard Node/Jest tooling.
7.  **Separation of PDF Logic**:
    PDF generation is handled synchronously/locally inside the `popup.js` after recording stops. This prevents the background script from holding heavy dependencies in memory, keeping the extension lightweight.
