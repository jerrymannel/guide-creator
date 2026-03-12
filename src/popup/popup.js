document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');

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
        startBtn.hidden = false;
        stopBtn.hidden = true;
        statusEl.textContent = 'Generating PDF...';
        
        generatePDF(response.steps, response.pageTitle).then(() => {
          statusEl.textContent = 'PDF generated!';
          setTimeout(() => { statusEl.textContent = 'Ready'; }, 3000);
        }).catch(err => {
          console.error(err);
          statusEl.textContent = 'Error generating PDF';
        });
      }
    });
  });
});

async function generatePDF(steps, pageTitle) {
  console.log('Generating PDF for steps:', steps);
  
  // The UMD bundle of jsPDF 2.5.1 exports to window.jspdf.jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(22);
  doc.text("Guide Creator Document", 20, 20);
  
  let yOffset = 35;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Add new page if close to bottom
    if (yOffset > 270) {
      doc.addPage();
      yOffset = 20;
    }
    
    doc.setFontSize(14);
    doc.text(`Step ${i + 1}: ${step.text}`, 20, yOffset);
    yOffset += 10;
    
    if (step.screenshot) {
      console.log(`Adding screenshot for step ${i + 1}`);
      // Default to common aspect ratio assumption (~16:9) to fit on A4
      const imgWidth = 170;
      const imgHeight = imgWidth * (9/16); 
      
      if (yOffset + imgHeight > 280) {
        doc.addPage();
        yOffset = 20;
      }
      
      try {
        doc.addImage(step.screenshot, 'PNG', 20, yOffset, imgWidth, imgHeight);
        yOffset += imgHeight + 10;
      } catch (e) {
        console.error('Error adding image to PDF:', e);
        doc.text("[Error adding screenshot]", 20, yOffset);
        yOffset += 10;
      }
    } else {
      yOffset += 5; // extra spacing for text-only step
    }
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
