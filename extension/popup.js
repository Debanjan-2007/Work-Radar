// Popup controller for Work Radar Chrome Extension

async function getServerBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl'], (data) => {
      const origin = (data.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
      resolve(origin);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const topTitleEl = document.getElementById('top-task-title');
  const topSourceEl = document.getElementById('top-task-source');
  const topScoreEl = document.getElementById('top-task-score');
  const contentInput = document.getElementById('ext-content');
  const captureForm = document.getElementById('ext-capture-form');
  const statusMsg = document.getElementById('status-msg');
  const openDashboardBtn = document.getElementById('btn-open-dashboard');
  const toggleSettingsBtn = document.getElementById('btn-toggle-settings');
  const settingsDrawer = document.getElementById('settings-drawer');
  const serverUrlInput = document.getElementById('server-url-input');
  const saveSettingsBtn = document.getElementById('btn-save-settings');
  const savedMsg = document.getElementById('settings-saved-msg');

  let serverUrl = await getServerBaseUrl();
  if (serverUrlInput) serverUrlInput.value = serverUrl;

  // Toggle settings drawer
  toggleSettingsBtn?.addEventListener('click', () => {
    settingsDrawer?.classList.toggle('hidden');
  });

  // Save server URL
  saveSettingsBtn?.addEventListener('click', async () => {
    const newUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
    if (!newUrl) return;
    chrome.storage.sync.set({ serverUrl: newUrl }, async () => {
      serverUrl = newUrl;
      savedMsg?.classList.remove('hidden');
      setTimeout(() => savedMsg?.classList.add('hidden'), 2000);
      loadTopTask();
    });
  });

  openDashboardBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: serverUrl });
  });

  // Load current top task ("DO THIS NOW")
  async function loadTopTask() {
    try {
      const res = await fetch(`${serverUrl}/api/v1/tasks/next`, {
        headers: { 'X-Work-Radar-Client': 'chrome-extension' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          topTitleEl.textContent = data.task.title;
          topSourceEl.textContent = data.task.source;
          topScoreEl.textContent = `Score: ${data.task.priority_score}`;
        } else {
          topTitleEl.textContent = 'All tasks completed!';
          topSourceEl.textContent = 'Radar Clear';
          topScoreEl.textContent = '';
        }
      } else {
        topTitleEl.textContent = 'Dashboard unreachable';
        topSourceEl.textContent = 'Offline';
      }
    } catch (err) {
      topTitleEl.textContent = 'Dashboard unreachable';
      topSourceEl.textContent = 'Offline';
    }
  }

  loadTopTask();

  // Pre-fill active tab's selected text if available
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => window.getSelection().toString()
        },
        (results) => {
          if (results && results[0] && results[0].result) {
            contentInput.value = results[0].result;
          }
        }
      );
    }
  } catch (err) {
    console.log('Active tab scripting not available in current context:', err);
  }

  // Handle capture submission
  captureForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = contentInput.value.trim();
    if (!content) return;

    statusMsg.classList.remove('hidden');
    statusMsg.textContent = 'Analyzing with Radar AI...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await fetch(`${serverUrl}/api/v1/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Work-Radar-Client': 'chrome-extension'
        },
        body: JSON.stringify({
          content,
          source: 'chrome',
          url: tab ? tab.url : '',
          subject: tab ? tab.title : 'Chrome Capture'
        })
      });

      const data = await res.json();
      if (data.isDuplicate) {
        statusMsg.textContent = `Duplicate detected: "${data.duplicateDetails.matchedTask.title}". Check dashboard.`;
      } else if (data.success) {
        statusMsg.textContent = 'Added to Priority Queue!';
        contentInput.value = '';
      } else {
        statusMsg.textContent = data.message || 'Capture failed';
      }
    } catch (err) {
      statusMsg.textContent = 'Failed to connect to Work Radar.';
    }
  });
});
