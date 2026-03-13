const { chrome } = require('jest-chrome');

describe('Content Script tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useFakeTimers();

    // Mock chrome.runtime.sendMessage for initial GET_STATUS
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      if (msg.action === 'GET_STATUS' && cb) {
        cb({ isRecording: false });
      } else if (cb) {
        cb({ success: true });
      }
    });

    document.body.innerHTML = `
      <div id="test-div" class="my-class">Test</div>
      <input id="test-input" type="text" />
    `;

    // Re-evaluate content.js
    require('../src/content/content.js');
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('handles PING message', () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage.callListeners({ action: 'PING' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'PONG' });
  });

  it('starts and stops recording via messages', () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage.callListeners({ action: 'START_RECORDING' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    
    // Now recording is true, let's trigger a click
    const div = document.getElementById('test-div');
    div.click();
    
    // Fast forward timeline for setTimeouts
    jest.runAllTimers();
    
    // Check if capture was sent
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CAPTURE_CLICK_STEP'
    }));

    // Stop recording
    jest.clearAllMocks();
    chrome.runtime.onMessage.callListeners({ action: 'STOP_RECORDING' }, {}, sendResponse);
    
    div.click();
    jest.runAllTimers();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('handles scroll events intelligently', () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage.callListeners({ action: 'START_RECORDING' }, {}, sendResponse);
    
    // Initial scroll sync
    window.scrollY = 0;
    
    // Scroll down
    window.scrollY = 100;
    window.dispatchEvent(new Event('scroll'));
    
    // Should debounce
    jest.advanceTimersByTime(200);
    window.scrollY = 150;
    window.dispatchEvent(new Event('scroll'));
    
    jest.advanceTimersByTime(500); // Trigger debounce
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RECORD_STEP',
      step: expect.objectContaining({
        type: 'scroll',
        direction: 'scroll down',
        scrollY: 150
      })
    }));
  });

  it('handles typing inputs', () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage.callListeners({ action: 'START_RECORDING' }, {}, sendResponse);
    
    const input = document.getElementById('test-input');
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    
    jest.advanceTimersByTime(500);
    input.value = 'hello world';
    input.dispatchEvent(new Event('input'));
    
    jest.advanceTimersByTime(1000); // 1s debounce
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RECORD_STEP',
      step: expect.objectContaining({
        type: 'input',
        value: 'hello world'
      })
    }));
  });
});
