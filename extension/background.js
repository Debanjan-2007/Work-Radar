// Background Service Worker for Work Radar Chrome Extension (Manifest V3)

async function getServerBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl'], (data) => {
      const origin = (data.serverUrl || 'https://work-radar-4hb0.onrender.com').replace(/\/+$/, '');
      resolve(origin);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  // Create Context Menu item
  chrome.contextMenus.create({
    id: 'work-radar-capture',
    title: 'Add to Work Radar',
    contexts: ['selection']
  });
  console.log('[Work Radar Extension] Context menu registered.');
});

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'work-radar-capture') {
    const selectedText = info.selectionText;
    const pageUrl = tab ? tab.url : '';
    const pageTitle = tab ? tab.title : '';

    console.log('[Work Radar Extension] Capturing selection:', selectedText);

    try {
      const serverUrl = await getServerBaseUrl();
      const response = await fetch(`${serverUrl}/api/v1/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Work-Radar-Client': 'chrome-extension'
        },
        body: JSON.stringify({
          content: selectedText,
          source: 'chrome',
          url: pageUrl,
          subject: pageTitle,
          sender: `Web Selection (${new URL(pageUrl || 'https://work-radar-4hb0.onrender.com').hostname})`
        })
      });

      const result = await response.json();
      console.log('[Work Radar Extension] Capture result:', result);

      // Notify content script
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WORK_RADAR_CAPTURED',
          success: result.success,
          message: result.message
        });
      }
    } catch (err) {
      console.error('[Work Radar Extension] Failed to capture:', err);
    }
  }
});
