document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');

  const titlePrompt = document.getElementById('titlePrompt');
  const guideTitleInput = document.getElementById('guideTitle');
  const generatePdfBtn = document.getElementById('generatePdfBtn');

  let currentSteps = [];
  let currentPageTitle = '';

  // Initialize UI state
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
    if (response && response.isRecording) {
      startBtn.hidden = true;
      stopBtn.hidden = false;
      statusEl.textContent = 'Recording in progress...';
    }
  });

  startBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'START_RECORDING' }, (response) => {
      if (response && response.status === 'recording') {
        startBtn.hidden = true;
        stopBtn.hidden = false;
        statusEl.textContent = 'Recording in progress...';
      }
    });
  });

  stopBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'STOP_RECORDING' }, (response) => {
      if (response && response.status === 'stopped') {
        startBtn.hidden = true;
        stopBtn.hidden = true;
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
        startBtn.hidden = false;
      }, 3000);
    }).catch(err => {
      console.error(err);
      statusEl.textContent = 'Error generating PDF';
      startBtn.hidden = false;
    });
  });
});

async function generatePDF(steps, pageTitle) {
  console.log('Generating PDF for steps:', steps);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont('helvetica');
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(pageTitle || "Guide Document", 20, 20);

  let yOffset = 35;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Formatting variables
    const boxMargin = 20;
    const boxWidth = doc.internal.pageSize.width - (boxMargin * 2);
    const imgWidth = boxWidth - 10;

    let boxHeight = 15; // Padding and text space
    let imgHeight = 0;

    if (step.screenshot) {
      imgHeight = imgWidth * (9 / 16);
      boxHeight += imgHeight + 5;
    }

    // Add new page if close to bottom
    if (yOffset + boxHeight > 280) {
      doc.addPage();
      yOffset = 20;
    }

    // Draw light blue box
    doc.setFillColor(238, 243, 248);
    doc.setDrawColor(238, 243, 248);
    doc.roundedRect(boxMargin, yOffset, boxWidth, boxHeight, 2, 2, 'FD');

    // Draw step circle
    doc.setFillColor(255, 255, 255);
    doc.circle(boxMargin + 10, yOffset + 7.5, 5, 'F');

    // Draw step number
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}`, boxMargin + 10, yOffset + 7.5, { align: 'center', baseline: 'middle' });

    // Draw step text
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${step.text}`, boxMargin + 20, yOffset + 7.5, { baseline: 'middle' });

    let innerYOffset = yOffset + 18; // Text leaves room below

    if (step.screenshot) {
      console.log(`Adding screenshot for step ${i + 1}`);
      try {
        // Draw border
        doc.setDrawColor(119, 136, 153);
        doc.setLineWidth(0.5);
        doc.rect(boxMargin + 5, innerYOffset, imgWidth, imgHeight, 'D');

        doc.addImage(step.screenshot, 'PNG', boxMargin + 5, innerYOffset, imgWidth, imgHeight);

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
  doc.save(`${safeFilename}.pdf`);

  // Clear session after download
  chrome.runtime.sendMessage({ action: 'CLEAR_SESSION' }, (response) => {
    if (response && response.success) {
      console.log('Session cleared successfully.');
    }
  });
}
