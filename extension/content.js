// Content script for Work Radar Chrome Extension

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WORK_RADAR_CAPTURED') {
    showToastNotification(message.message || 'Added to Work Radar!');
  }
});

function showToastNotification(text) {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.background = '#0d1322';
  toast.style.color = '#10b981';
  toast.style.border = '1px solid #10b981';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
  toast.style.zIndex = '999999';
  toast.style.fontSize = '14px';
  toast.style.fontFamily = 'system-ui, sans-serif';
  toast.style.fontWeight = '600';
  toast.style.transition = 'all 0.3s ease';
  toast.textContent = `📡 Work Radar: ${text}`;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
