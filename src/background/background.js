let isRecording = false;
let recordingSteps = [];

// Handle messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_RECORDING') {
    isRecording = true;
    recordingSteps = []; // Clear previous steps
    console.log('Recording session started.');
    
    // Change badge text or color if desired
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
    
    // Relay to active tab to start capturing
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_RECORDING' }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Content script not active.');
          }
        });
      }
    });

    sendResponse({ status: 'recording' });
  } 
  else if (request.action === 'STOP_RECORDING') {
    isRecording = false;
    console.log('Recording session stopped.');
    
    chrome.action.setBadgeText({ text: '' });
    
    // Relay to active tab to stop capturing
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let pageTitle = 'guide';
      if (tabs && tabs[0]) {
        pageTitle = tabs[0].title || 'guide';
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_RECORDING' }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Content script not active.');
          }
        });
      }
      
      console.log('Final Guide Steps:', recordingSteps);
      sendResponse({ status: 'stopped', steps: recordingSteps, pageTitle });
    });
  }
  else if (request.action === 'GET_STATUS') {
    sendResponse({ isRecording, steps: recordingSteps });
  }
  else if (request.action === 'CAPTURE_CLICK_STEP') {
    // Capture the visible tab for the click event
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      // If there's an error capturing (e.g. devtools focus), dataUrl might be undefined
      if (chrome.runtime.lastError) {
        console.warn('Screenshot failed:', chrome.runtime.lastError.message);
      }
      const step = {
        type: 'click',
        clientX: request.clientX,
        clientY: request.clientY,
        target: request.target,
        text: `Clicked on ${request.target.tagName.toLowerCase()}`,
        screenshot: dataUrl || null,
        timestamp: Date.now()
      };
      recordingSteps.push(step);
      console.log('Captured step:', step);
    });
    // Respond immediately since we don't need the sender to wait
    sendResponse({ success: true });
  }
  else if (request.action === 'RECORD_STEP') {
    // Scroll or input events
    const step = {
      ...request.step,
      timestamp: Date.now()
    };
    recordingSteps.push(step);
    console.log('Captured step:', step);
    sendResponse({ success: true });
  }
  
  // Return true to keep the message channel open for async responses if needed
  return true; 
});

// Listener for installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Guide Creator Extension installed.');
});
