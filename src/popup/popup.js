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
  
  // Helper to convert array buffer to base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };
  
  // Try to load Poppins dynamically
  try {
    const lightUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Light.ttf';
    const boldUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf';
    
    const [lightRes, boldRes] = await Promise.all([
      fetch(lightUrl),
      fetch(boldUrl)
    ]);
    
    if (!lightRes.ok || !boldRes.ok) throw new Error('Failed to download Poppins');
    
    const lightBuffer = await lightRes.arrayBuffer();
    const boldBuffer = await boldRes.arrayBuffer();
    
    doc.addFileToVFS('Poppins-Light.ttf', arrayBufferToBase64(lightBuffer));
    doc.addFileToVFS('Poppins-Bold.ttf', arrayBufferToBase64(boldBuffer));
    doc.addFont('Poppins-Light.ttf', 'Poppins', 'normal');
    doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
    doc.setFont('Poppins');
  } catch (e) {
    console.warn('Could not load Poppins font, falling back to Verdana.', e);
    // If Verdana is not added to jsPDF VFS this will fallback gracefully to default Helvetica
    doc.setFont('Verdana');
  }
  
  doc.setFontSize(22);
  doc.setFont(doc.getFont().fontName, 'bold');
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
      imgHeight = imgWidth * (9/16); 
      boxHeight += imgHeight + 5;
    }
    
    // Add new page if close to bottom
    if (yOffset + boxHeight > 280) {
      doc.addPage();
      yOffset = 20;
    }
    
    // Draw light gray box
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(boxMargin, yOffset, boxWidth, boxHeight, 3, 3, 'FD');
    
    // Draw step circle
    doc.setFillColor(255, 255, 255);
    doc.circle(boxMargin + 10, yOffset + 7.5, 5, 'F');
    
    // Draw step number
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.setFont(doc.getFont().fontName, 'bold');
    doc.text(`${i + 1}`, boxMargin + 10, yOffset + 7.5, { align: 'center', baseline: 'middle' });
    
    // Draw step text
    doc.setFontSize(14);
    doc.setFont(doc.getFont().fontName, 'normal');
    doc.text(`${step.text}`, boxMargin + 20, yOffset + 7.5, { baseline: 'middle' });
    
    let innerYOffset = yOffset + 18; // Text leaves room below
    
    if (step.screenshot) {
      console.log(`Adding screenshot for step ${i + 1}`);
      try {
        // Draw soft shadow (simulated blur)
        const shadowColor = 180;
        const maxLayers = 4;
        for (let s = maxLayers; s > 0; s--) {
          doc.setGState(new doc.GState({opacity: 0.1}));
          doc.setFillColor(shadowColor, shadowColor, shadowColor);
          doc.rect(boxMargin + 5 + s, innerYOffset + s, imgWidth, imgHeight, 'F');
        }
        doc.setGState(new doc.GState({opacity: 1.0}));
        
        // Draw border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(boxMargin + 5, innerYOffset, imgWidth, imgHeight, 'D');

        doc.addImage(step.screenshot, 'PNG', boxMargin + 5, innerYOffset, imgWidth, imgHeight);
        
        // Draw red circle for clicks
        if (step.type === 'click' && step.clientX != null && step.clientY != null && step.windowWidth && step.windowHeight) {
          const ratioX = step.clientX / step.windowWidth;
          const ratioY = step.clientY / step.windowHeight;
          const clickX = boxMargin + 5 + (imgWidth * ratioX);
          const clickY = innerYOffset + (imgHeight * ratioY);
          
          doc.setDrawColor(229, 57, 53); // Red
          doc.setLineWidth(1.5);
          doc.circle(clickX, clickY, 8, 'D'); // Draw circle exactly where they clicked
          
          doc.setGState(new doc.GState({opacity: 0.3}));
          doc.setFillColor(229, 57, 53);
          doc.circle(clickX, clickY, 8, 'F');
          doc.setGState(new doc.GState({opacity: 1.0}));
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
