document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');

  const introContainer = document.getElementById('introContainer');
  const titlePrompt = document.getElementById('titlePrompt');
  const guideTitleInput = document.getElementById('guideTitle');
  const generatePdfBtn = document.getElementById('generatePdfBtn');
  const recordingIndicator = document.getElementById('recordingIndicator');

  let currentSteps = [];
  let currentPageTitle = '';

  // Initialize UI state
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
    if (response && response.isRecording) {
      introContainer.hidden = true;
      startBtn.hidden = true;
      stopBtn.hidden = false;
      recordingIndicator.hidden = false;
      statusEl.textContent = 'Recording in progress...';
    }
  });

  startBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'START_RECORDING' }, (response) => {
      if (response && response.status === 'recording') {
        introContainer.hidden = true;
        startBtn.hidden = true;
        stopBtn.hidden = false;
        recordingIndicator.hidden = false;
        statusEl.textContent = 'Recording in progress...';
      }
    });
  });

  stopBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'STOP_RECORDING' }, (response) => {
      if (response && response.status === 'stopped') {
        startBtn.hidden = true;
        stopBtn.hidden = true;
        recordingIndicator.hidden = true;
        titlePrompt.hidden = false;

        guideTitleInput.value = response.pageTitle || 'Guide Document';
        currentSteps = response.steps || [];
        currentPageTitle = response.pageTitle || 'Guide Document';

        statusEl.textContent = 'Please enter a title...';
      }
    });
  });

  generatePdfBtn.addEventListener('click', () => {
    statusEl.textContent = 'Generating PDF...';
    const finalTitle = guideTitleInput.value.trim() || currentPageTitle || 'Guide Document';
    titlePrompt.hidden = true;

    generatePDF(currentSteps, finalTitle).then(() => {
      statusEl.textContent = 'PDF generated!';
      setTimeout(() => {
        statusEl.textContent = 'Ready';
        introContainer.hidden = false;
        startBtn.hidden = false;
      }, 3000);
    }).catch(err => {
      console.error(err);
      statusEl.textContent = 'Error generating PDF';
      introContainer.hidden = false;
      startBtn.hidden = false;
    });
  });
});

/**
 * Loads an image from a URL and returns a Data URL.
 */
function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function generatePDF(steps, pageTitle) {
  console.log('Generating PDF for steps:', steps);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont('helvetica');
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');

  const maxTitleWidth = doc.internal.pageSize.width - 40;
  const titleLines = doc.splitTextToSize(pageTitle || "Guide Document", maxTitleWidth);
  doc.text(titleLines, 20, 20);

  const getImageAspectRatio = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
      img.onerror = () => resolve(9 / 16); // fallback
      img.src = dataUrl;
    });
  };

  // Adjust starting offset based on title height
  let yOffset = 25 + (titleLines.length * 10);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Formatting variables
    const boxMargin = 20;
    const boxWidth = doc.internal.pageSize.width - (boxMargin * 2);
    const imgWidth = boxWidth - 10;

    // Handle multi-line text wrapping
    const maxTextWidth = boxWidth - 30; // Space after index circle
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(step.text, maxTextWidth);
    const lineHeight = 6;
    const textBlockHeight = lines.length * lineHeight;
    const headerHeight = Math.max(15, textBlockHeight + 10);

    let boxHeight = headerHeight;
    let imgHeight = 0;

    if (step.screenshot) {
      const aspectRatio = await getImageAspectRatio(step.screenshot);
      imgHeight = imgWidth * aspectRatio;
      boxHeight += imgHeight + 5;
    }

    // Add new page if close to bottom
    if (yOffset + boxHeight > 280) {
      doc.addPage();
      yOffset = 20;
    }

    // Draw light blue box
    doc.setFillColor("#ddeaf0");
    doc.setDrawColor("#ddeaf0");
    doc.roundedRect(boxMargin, yOffset, boxWidth, boxHeight, 2, 2, 'FD');

    // Draw step circle
    doc.setFillColor(255, 255, 255);
    doc.circle(boxMargin + 10, yOffset + 7.5, 5, 'F');

    // Draw step number
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}`, boxMargin + 10, yOffset + 7.5, { align: 'center', baseline: 'middle' });

    // Draw step text (multi-line)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    // Align text with circle vertically for single line, or start near top for multi-line
    const textY = lines.length === 1 ? yOffset + 7.5 : yOffset + 6.5;
    doc.text(lines, boxMargin + 20, textY, { baseline: 'middle' });

    let innerYOffset = yOffset + headerHeight + 2; // Position for image below text

    if (step.screenshot) {
      console.log(`Adding screenshot for step ${i + 1}`);
      try {
        // Draw border
        doc.setDrawColor(119, 136, 153);
        doc.setLineWidth(0.5);
        doc.rect(boxMargin + 5, innerYOffset, imgWidth, imgHeight, 'D');

        doc.addImage(step.screenshot, 'JPEG', boxMargin + 5, innerYOffset, imgWidth, imgHeight, undefined, 'FAST');

        // Draw red circle for clicks
        if (step.type === 'click' && step.clientX != null && step.clientY != null && step.windowWidth && step.windowHeight) {
          const ratioX = step.clientX / step.windowWidth;
          const ratioY = step.clientY / step.windowHeight;
          const clickX = boxMargin + 5 + (imgWidth * ratioX);
          const clickY = innerYOffset + (imgHeight * ratioY);

          doc.setDrawColor(218, 112, 214); // Red
          doc.setLineWidth(0.5);
          doc.circle(clickX, clickY, 6, 'D'); // Draw circle exactly where they clicked

          doc.setGState(new doc.GState({ opacity: 0.3 }));
          doc.setFillColor(218, 112, 214);
          doc.circle(clickX, clickY, 6, 'F');
          doc.setGState(new doc.GState({ opacity: 1.0 }));
        }
      } catch (e) {
        console.error('Error adding image to PDF:', e);
        doc.setTextColor(255, 0, 0);
        doc.text("[Error adding screenshot]", boxMargin + 5, innerYOffset);
        doc.setTextColor(50, 50, 50);
      }
    }

    yOffset += boxHeight + 10; // Spacing after the box
  }

  const safeFilename = (pageTitle || 'guide').replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // Add footers to all pages before saving
  try {
    const logoUrl = chrome.runtime.getURL('src/assets/icon128.png');
    const logoDataUrl = await loadImageAsDataUrl(logoUrl);
    await addFooters(doc, logoDataUrl);
  } catch (err) {
    console.error('Failed to add footers:', err);
    // Continue saving even if footer fails
    await addFooters(doc, null);
  }

  doc.save(`${safeFilename}.pdf`);

  // Clear session after download
  chrome.runtime.sendMessage({ action: 'CLEAR_SESSION' }, (response) => {
    if (response && response.success) {
      console.log('Session cleared successfully.');
    }
  });
}

/**
 * Adds pagination and branding to every page in the document.
 */
async function addFooters(doc, logoDataUrl) {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom line separator
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);

    // Left side: Brand text + Logo
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Created with StepSnap', 20, pageHeight - 10);

    if (logoDataUrl) {
      // Adjust X position based on text width if needed, for simplicity placing it after text
      const textWidth = doc.getTextWidth('Created with StepSnap');
      doc.addImage(logoDataUrl, 'PNG', 20 + textWidth + 3, pageHeight - 13.5, 4, 4);
    }

    // Right side: Page number
    const pageText = `Page ${i} of ${totalPages}`;
    doc.text(pageText, pageWidth - 20, pageHeight - 10, { align: 'right' });
  }
}
