const { chrome } = require('jest-chrome');

// Mock chrome.action manually
if (!chrome.action) {
  chrome.action = { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() };
}

describe('Race Condition tests', () => {
  let storageState = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    if (chrome.runtime.onMessage.clearListeners) {
      chrome.runtime.onMessage.clearListeners();
    }
    storageState = { recordingSteps: [] };

    // Mock chrome.storage.local with artificial delays to trigger race conditions
    chrome.storage.local.get.mockImplementation((keys, cb) => {
      setTimeout(() => {
        if (typeof keys === 'string') {
          cb({ [keys]: storageState[keys] });
        } else if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => res[k] = storageState[k]);
          cb(res);
        } else {
          cb(storageState);
        }
      }, 10);
    });

    chrome.storage.local.set.mockImplementation((items, cb) => {
      setTimeout(() => {
        Object.assign(storageState, items);
        if (cb) cb();
      }, 10);
    });

    // Load background script
    require('../src/background/background.js');
  });

  it('should capture all steps even when sent rapidly', async () => {
    const sendResponse = jest.fn();
    const mockSender = { tab: { windowId: 1 } };
    
    // Mock captureVisibleTab
    chrome.tabs.captureVisibleTab.mockImplementation((windowId, opts, cb) => cb('data:image/jpeg;...'));

    // Send 10 rapid click steps
    const numSteps = 10;
    for (let i = 0; i < numSteps; i++) {
       chrome.runtime.onMessage.callListeners(
         { 
           action: 'CAPTURE_CLICK_STEP', 
           target: { tagName: 'BUTTON', innerText: `Button ${i}` },
           clientX: 10, clientY: 10, windowWidth: 100, windowHeight: 100
         }, 
         mockSender, 
         sendResponse
       );
    }

    // Wait long enough for all sequential promise chains to finish
    // 10 steps * (10ms read + 10ms write) = 200ms min, let's wait 1s to be safe
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(storageState.recordingSteps.length).toBe(numSteps);
    for (let i = 0; i < numSteps; i++) {
        expect(storageState.recordingSteps[i].text).toBe(`Click on "Button ${i}"`);
    }
  });

  it('should wait for all pending screenshots and storage writes when stopping', async () => {
    const sendResponse = jest.fn();
    const mockSender = { tab: { windowId: 1 } };
    chrome.tabs.captureVisibleTab.mockImplementation((windowId, opts, cb) => cb('data:image/jpeg;...'));
    chrome.tabs.get.mockImplementation((tabId, cb) => cb({ id: 100, title: 'Test Page', windowId: 1 }));
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => cb());
    chrome.storage.local.get.mockImplementation((keys, cb) => {
        // Intercept to return our local state
        if (keys.includes('recordingSteps')) {
            cb({ ...storageState, recordingTabId: 100 });
        } else {
            cb({ ...storageState, isRecording: true, recordingTabId: 100 });
        }
    });

    // Send rapid clicks
    for (let i = 0; i < 3; i++) {
       chrome.runtime.onMessage.callListeners(
         { 
           action: 'CAPTURE_CLICK_STEP', 
           target: { tagName: 'BUTTON', innerText: `Click ${i}` },
           clientX: 10, clientY: 10, windowWidth: 100, windowHeight: 100
         }, 
         mockSender, 
         sendResponse
       );
    }

    // Immediately call STOP_RECORDING
    chrome.runtime.onMessage.callListeners({ action: 'STOP_RECORDING' }, {}, sendResponse);

    // Wait for everything to finish
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have 3 clicks + 1 final step = 4 steps
    expect(storageState.recordingSteps.length).toBe(4);
    expect(storageState.recordingSteps[storageState.recordingSteps.length-1].type).toBe('final');
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }));
  });
});
