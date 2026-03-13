const { chrome } = require('jest-chrome');

// Mock chrome.action manually since jest-chrome may not have it
if (!chrome.action) {
  chrome.action = { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() };
}

describe('Background Script tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    chrome.action.setBadgeText.mockClear();
    chrome.action.setBadgeBackgroundColor.mockClear();

    // Re-evaluate background.js to register clean listeners
    require('../src/background/background.js');
  });

  it('handles GET_STATUS and returns recording state', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ isRecording: true, recordingSteps: [] }));
    const sendResponse = jest.fn();
    
    chrome.runtime.onMessage.callListeners({ action: 'GET_STATUS' }, {}, sendResponse);
    await new Promise(process.nextTick); // Let promises resolve
    
    expect(chrome.storage.local.get).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ isRecording: true, steps: [] });
  });

  it('handles CLEAR_SESSION and clears storage', async () => {
    chrome.storage.local.clear.mockImplementation((cb) => cb());
    const sendResponse = jest.fn();
    
    chrome.runtime.onMessage.callListeners({ action: 'CLEAR_SESSION' }, {}, sendResponse);
    await new Promise(process.nextTick);
    
    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('handles RECORD_STEP and stores the step', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ recordingSteps: [] }));
    chrome.storage.local.set.mockImplementation((items, cb) => cb());
    const sendResponse = jest.fn();
    
    const step = { type: 'input', text: 'Typed "hello"' };
    chrome.runtime.onMessage.callListeners({ action: 'RECORD_STEP', step }, {}, sendResponse);
    await new Promise(process.nextTick);
    
    expect(chrome.storage.local.set).toHaveBeenCalled();
    const setArgs = chrome.storage.local.set.mock.calls[0][0];
    expect(setArgs.recordingSteps.length).toBe(1);
    expect(setArgs.recordingSteps[0].type).toBe('input');
    expect(setArgs.recordingSteps[0].text).toBe('Typed "hello"');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('handles START_RECORDING safely when content script ping works', async () => {
    chrome.tabs.query.mockImplementation((opts, cb) => cb([{ id: 100 }]));
    
    // Mock sendMessage: respond to PING with PONG
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => {
      if (msg.action === 'PING') cb({ status: 'PONG' });
      else cb();
    });
    
    chrome.storage.local.set.mockImplementation((items, cb) => cb());
    const sendResponse = jest.fn();
    
    chrome.runtime.onMessage.callListeners({ action: 'START_RECORDING' }, {}, sendResponse);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Should set recording true & tabId in storage
    const setArgs = chrome.storage.local.set.mock.calls[0][0];
    expect(setArgs.isRecording).toBe(true);
    expect(setArgs.recordingTabId).toBe(100);
    
    // Should update badge
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
    expect(sendResponse).toHaveBeenCalledWith({ status: 'recording' });
  });

  it('handles STOP_RECORDING safely', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ recordingTabId: 100, recordingSteps: [] }));
    chrome.storage.local.set.mockImplementation((items, cb) => cb());
    chrome.tabs.get.mockImplementation((tabId, cb) => cb({ id: 100, title: 'My Page', windowId: 200 }));
    
    // captureVisibleTab for final step
    chrome.tabs.captureVisibleTab.mockImplementation((windowId, opts, cb) => cb('data:image/jpeg;...'));
    
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => cb());
    const sendResponse = jest.fn();
    
    chrome.runtime.onMessage.callListeners({ action: 'STOP_RECORDING' }, {}, sendResponse);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ isRecording: false }, expect.any(Function));
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'stopped',
      steps: expect.any(Array),
      pageTitle: 'My Page'
    });
    
    // Check that final step was appended
    const lastSetCallArgs = chrome.storage.local.set.mock.calls[chrome.storage.local.set.mock.calls.length - 1][0];
    if (lastSetCallArgs.recordingSteps) {
      expect(lastSetCallArgs.recordingSteps[0].type).toBe('final');
    }
  });
});
