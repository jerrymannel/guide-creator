// Initialize UI or observers when loaded
console.log('Guide Creator Content Script initialized.');

let isRecording = false;

// Debounce timers
let scrollTimeout = null;
let typeTimeout = null;

let lastScrollY = window.scrollY;

// Listen for messages from the popup or background scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ status: 'PONG' });
  }

  if (request.action === 'START_RECORDING') {
    isRecording = true;
    console.log('Content script: Recording started.');
    sendResponse({ success: true });
  }

  if (request.action === 'STOP_RECORDING') {
    isRecording = false;
    console.log('Content script: Recording stopped.');
    sendResponse({ success: true });
  }

  // Example: Highlight an element on the page
  if (request.action === 'HIGHLIGHT_ELEMENT') {
    const el = document.querySelector(request.selector);
    if (el) {
      el.style.border = '2px solid red';
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }

  return true;
});

// Sync status with background script on load
chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
  if (response && response.isRecording) {
    isRecording = true;
    console.log('Content script: Resumed recording state from background.');
  }
});

// Helper to get a unique selector for an element
function getCssSelector(el) {
  if (!(el instanceof Element)) return;
  const path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += '#' + el.id;
      path.unshift(selector);
      break;
    } else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector) nth++;
      }
      if (nth != 1) selector += ":nth-of-type(" + nth + ")";
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

// 1. Click Listener
document.addEventListener('click', (e) => {
  if (!isRecording) return;

  // Create highlight circle
  const circle = document.createElement('div');
  circle.className = 'guide-creator-click-circle';
  circle.style.left = e.clientX + 'px';
  circle.style.top = e.clientY + 'px';
  document.body.appendChild(circle);

  // Cleanup circle after animation
  setTimeout(() => {
    if (circle.parentNode) {
      circle.parentNode.removeChild(circle);
    }
  }, 1000);

  const target = e.target;
  const targetInfo = {
    tagName: target.tagName,
    id: target.id,
    className: typeof target.className === 'string' ? target.className : '',
    innerText: target.innerText ? target.innerText.substring(0, 50) : '',
    selector: getCssSelector(target)
  };

  // Wait a tiny bit for the visual ripple to appear, then request screenshot
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'CAPTURE_CLICK_STEP',
      target: targetInfo,
      clientX: e.clientX,
      clientY: e.clientY
    });
  }, 50);
}, true);

// 2. Scroll Listener
window.addEventListener('scroll', () => {
  if (!isRecording) return;

  clearTimeout(scrollTimeout);

  scrollTimeout = setTimeout(() => {
    const currentScrollY = window.scrollY;
    // Determine scroll direction
    let direction = 'scroll';
    if (currentScrollY > lastScrollY) {
      direction = 'scroll down';
    } else if (currentScrollY < lastScrollY) {
      direction = 'scroll up';
    }

    // Only send if it significantly changed to avoid tiny jitters or if it's actually different
    if (Math.abs(currentScrollY - lastScrollY) > 20) {
      chrome.runtime.sendMessage({
        action: 'RECORD_STEP',
        step: {
          type: 'scroll',
          direction: direction,
          text: `User ${direction}`,
          scrollY: currentScrollY
        }
      });
    }

    lastScrollY = currentScrollY;
  }, 500); // 500ms debounce
});

// 3. Input / Typings Listener
document.addEventListener('input', (e) => {
  if (!isRecording) return;

  clearTimeout(typeTimeout);

  const target = e.target;
  // Make sure it's an input or textarea
  if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

  typeTimeout = setTimeout(() => {
    const typedText = target.value;

    chrome.runtime.sendMessage({
      action: 'RECORD_STEP',
      step: {
        type: 'input',
        text: `Typed "${typedText}"`,
        value: typedText,
        selector: getCssSelector(target)
      }
    });
  }, 1000); // 1s debounce
}, true);
