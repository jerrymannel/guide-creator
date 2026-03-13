# StepSnap Extension

**StepSnap** is a Chrome extension designed to help users create engaging, step-by-step guides quickly and easily directly from their browser. It streamlines the process of documenting workflows, tutorials, or processes by capturing user interactions and generating structured guide content.

## Features

- **One-Click Recording**: Start and stop guide recording with a simple click on the extension icon.
- **Real-Time Status**: Visual feedback in the popup indicates whether the extension is recording or idle.
- **Content Generation**: Automatically captures user interactions (clicks, navigation) to build a structured guide.
- **Save & Export**: Once stopped, the guide is compiled and ready to be saved or exported (future capability).

## Getting Started

### Prerequisites

- Google Chrome browser
- Basic understanding of Chrome extensions

### Installation

1.  **Clone the repository** (or download the source code).
2.  **Open Chrome** and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle switch, usually in the top-right corner).
4.  Click **Load unpacked**.
5.  Select the `guide-creator` folder you cloned/downloaded.

The extension icon should now appear in your browser toolbar.

## Usage

1.  Navigate to the web page where you want to create a guide.
2.  Click the **StepSnap** extension icon in the toolbar.
3.  Click **Start Recording** in the popup.
4.  Perform the actions you want to document (e.g., click buttons, fill forms, navigate).
5.  When finished, click **Stop Recording**.
6.  The extension will process the interactions and save the guide.

## Project Structure

```
guide-creator/
├── manifest.json             # Extension configuration and metadata
├── src/
│   ├── background/           # Background service worker
│   │   └── background.js     # Handles extension lifecycle and messages
│   ├── content/              # Content scripts injected into web pages
│   │   ├── content.js        # Interaction tracking and DOM manipulation
│   │   └── content.css       # Styling for highlighted elements
│   └── popup/                # Popup UI
│       ├── popup.html        # Popup HTML structure
│       ├── popup.css         # Popup styling
│       └── popup.js          # Popup logic and event handling
└── README.md                 # Project documentation
```

## Development

### Adding New Features

- **UI Changes**: Edit `src/popup/popup.html` and `src/popup/popup.css`.
- **Background Logic**: Modify `src/background/background.js`.
- **Content Interaction**: Update `src/content/content.js` and `src/content/content.css`.

### Reloading the Extension

After making changes to the code:
1.  Go back to `chrome://extensions`.
2.  Find the **Guide Creator** extension.
3.  Click the **Reload** button (circular arrow icon).

## License

ISC
