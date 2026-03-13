// Helper for storage
const storage = {
  get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
  set: (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve)),
  clear: () => new Promise((resolve) => chrome.storage.local.clear(resolve))
};

let pendingScreenshots = 0;
let stepProcessingPromise = Promise.resolve();

/**
 * Adds a step to storage sequentially using a promise chain to avoid race conditions.
 */
async function addStepToStorage(step) {
  stepProcessingPromise = stepProcessingPromise.then(async () => {
    const data = await storage.get('recordingSteps');
    const recordingSteps = data.recordingSteps || [];
    recordingSteps.push(step);
    await storage.set({ recordingSteps });
    console.log('Stored step:', step.type, step.text);
  }).catch(err => {
    console.error('Error adding step to storage:', err);
  });
  return stepProcessingPromise;
}

// Handle messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_RECORDING') {
    handleStartRecording(sendResponse, true);
    return true;
  }
  else if (request.action === 'STOP_RECORDING') {
    handleStopRecording(sendResponse);
    return true;
  }
  else if (request.action === 'GET_STATUS') {
    handleGetStatus(sendResponse);
    return true;
  }
  else if (request.action === 'CLEAR_SESSION') {
    handleClearSession(sendResponse);
    return true;
  }
  else if (request.action === 'CAPTURE_CLICK_STEP') {
    handleCaptureClickStep(request, sender, sendResponse);
    return true;
  }
  else if (request.action === 'RECORD_STEP') {
    handleRecordStep(request, sendResponse);
    return true;
  }
});

// Handle page refreshes or navigations
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const data = await storage.get(['isRecording', 'recordingTabId']);
    if (data.isRecording && data.recordingTabId === tabId) {
      console.log('Tab updated, ensuring recording state is resumed...');
      handleStartRecording(() => {}); 
    }
  }
});

async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'PING' }, (response) => {
        if (chrome.runtime.lastError || !response || response.status !== 'PONG') {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    console.log('Content script already active in tab:', tabId);
  } catch (e) {
    console.log('Content script not active, injecting now in tab:', tabId);
    // Inject content script and CSS
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content/content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['src/content/content.css']
    });
    // Wait a brief moment for script initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function handleStartRecording(sendResponse, resetSteps = false) {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs && tabs[0]) {
      const tabId = tabs[0].id;
      
      // Ensure content script is ready before proceeding
      await ensureContentScriptInjected(tabId);
      
      const storageData = {
        isRecording: true,
        recordingTabId: tabId
      };
      
      if (resetSteps) {
        storageData.recordingSteps = [];
      }
      
      await storage.set(storageData);
      
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
      
      chrome.tabs.sendMessage(tabId, { action: 'START_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to start recording even after injection:', chrome.runtime.lastError.message);
        }
      });
      sendResponse({ status: 'recording' });
    } else {
      sendResponse({ status: 'error', message: 'No active tab found' });
    }
  });
}

async function handleStopRecording(sendResponse) {
  const data = await storage.get(['recordingSteps', 'recordingTabId']);
  const recordingTabId = data.recordingTabId;
  let recordingSteps = data.recordingSteps || [];

  await storage.set({ isRecording: false });
  chrome.action.setBadgeText({ text: '' });

  const captureAndFinish = (windowId) => {
    pendingScreenshots++;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 }, async (dataUrl) => {
      try {
        if (chrome.runtime.lastError) {
          console.warn('Final screenshot failed:', chrome.runtime.lastError.message);
        } else {
          const step = {
            type: 'final',
            text: 'Final result',
            screenshot: dataUrl || null,
            timestamp: Date.now()
          };
          await addStepToStorage(step);
        }
      } finally {
        pendingScreenshots--;
        const waitForScreenshots = async () => {
          await stepProcessingPromise; // Wait for all storage updates to finish
          if (pendingScreenshots > 0) {
            console.log(`Waiting for ${pendingScreenshots} pending screenshots...`);
            setTimeout(waitForScreenshots, 100);
          } else {
            // Fetch the final steps explicitly to ensure we have everything
            const finalData = await storage.get('recordingSteps');
            finishStopRecording(recordingTabId, finalData.recordingSteps || [], sendResponse);
          }
        };
        waitForScreenshots();
      }
    });
  };

  if (recordingTabId) {
    chrome.tabs.get(recordingTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not get recording tab:', chrome.runtime.lastError.message);
        captureAndFinish(null);
        return;
      }
      captureAndFinish(tab ? tab.windowId : null);
    });
  } else {
    captureAndFinish(null);
  }
}

function finishStopRecording(tabId, steps, sendResponse) {
  const respond = (pageTitle) => {
    console.log('Final Guide Steps:', steps);
    sendResponse({ status: 'stopped', steps, pageTitle });
  };

  if (tabId) {
    chrome.tabs.get(tabId, (tab) => {
      const pageTitle = tab ? (tab.title || 'guide') : 'guide';
      chrome.tabs.sendMessage(tabId, { action: 'STOP_RECORDING' }, () => {
        if (chrome.runtime.lastError) console.warn('Content script not active.');
      });
      respond(pageTitle);
    });
  } else {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const pageTitle = (tabs && tabs[0]) ? (tabs[0].title || 'guide') : 'guide';
      respond(pageTitle);
    });
  }
}

async function handleGetStatus(sendResponse) {
  const data = await storage.get(['isRecording', 'recordingSteps']);
  sendResponse({ 
    isRecording: data.isRecording || false, 
    steps: data.recordingSteps || [] 
  });
}

async function handleClearSession(sendResponse) {
  await storage.clear();
  console.log('Recording session cleared from storage.');
  sendResponse({ success: true });
}

function handleCaptureClickStep(request, sender, sendResponse) {
  pendingScreenshots++;
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 50 }, async (dataUrl) => {
    try {
      if (chrome.runtime.lastError) {
        console.warn('Screenshot failed:', chrome.runtime.lastError.message);
      }
      
      const data = await storage.get('recordingSteps');
      const recordingSteps = data.recordingSteps || [];
      
      const textToDisplay = request.target.innerText ? request.target.innerText.trim() : request.target.tagName.toUpperCase();
      const step = {
        type: 'click',
        clientX: request.clientX,
        clientY: request.clientY,
        windowWidth: request.windowWidth,
        windowHeight: request.windowHeight,
        target: request.target,
        text: `Click on "${textToDisplay}"`,
        screenshot: dataUrl || null,
        timestamp: Date.now()
      };
      
      await addStepToStorage(step);
    } finally {
      pendingScreenshots--;
      sendResponse({ success: true });
    }
  });
}

async function handleRecordStep(request, sendResponse) {
  const step = {
    ...request.step,
    timestamp: Date.now()
  };
  
  await addStepToStorage(step);
  sendResponse({ success: true });
}
