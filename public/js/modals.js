/**
 * Work Radar Modals & Drawers Coordinator
 */
class WorkRadarModals {
  constructor() {
    this.pendingDuplicatePayload = null;
  }

  // --- Quick Capture Modal ---
  openCaptureModal(initialText = '') {
    const modal = document.getElementById('modal-capture');
    const contentInput = document.getElementById('capture-content');
    const previewBox = document.getElementById('ai-preview-box');

    if (contentInput && initialText) contentInput.value = initialText;
    if (previewBox) previewBox.classList.add('hidden');
    if (modal) modal.classList.remove('hidden');
  }

  closeCaptureModal() {
    const modal = document.getElementById('modal-capture');
    if (modal) modal.classList.add('hidden');
  }

  // --- Duplicate Resolution Dialog (PRD Section 24) ---
  showDuplicatePrompt(dupDetails, originalPayload) {
    this.pendingDuplicatePayload = originalPayload;
    const modal = document.getElementById('modal-duplicate');
    if (!modal) return;

    const reasonEl = document.getElementById('dup-reason-text');
    if (reasonEl) reasonEl.textContent = dupDetails.reason || 'A matching open task was found in your queue from the last 14 days.';

    const existingTitle = document.getElementById('dup-existing-title');
    if (existingTitle) existingTitle.textContent = dupDetails.matchedTask?.title || 'Existing Task';

    const existingMeta = document.getElementById('dup-existing-meta');
    if (existingMeta && dupDetails.matchedTask) {
      existingMeta.textContent = `${dupDetails.matchedTask.source.toUpperCase()} • Priority: ${dupDetails.matchedTask.priority_score}`;
    }

    const candidateTitle = document.getElementById('dup-candidate-title');
    if (candidateTitle) candidateTitle.textContent = originalPayload.extractedTitle || originalPayload.content.slice(0, 50);

    const candidateMeta = document.getElementById('dup-candidate-meta');
    if (candidateMeta) candidateMeta.textContent = `${(originalPayload.source || 'chrome').toUpperCase()} • Incoming Capture`;

    modal.classList.remove('hidden');
  }

  closeDuplicateModal() {
    const modal = document.getElementById('modal-duplicate');
    if (modal) modal.classList.add('hidden');
    this.pendingDuplicatePayload = null;
  }

  async resolveDuplicate(action) {
    if (!this.pendingDuplicatePayload) return;
    const payload = { ...this.pendingDuplicatePayload };
    this.closeDuplicateModal();

    if (action === 'MERGE' || action === 'SEPARATE') {
      try {
        await window.api.captureContent({
          ...payload,
          forceCreate: true
        });
        this.closeCaptureModal();
        if (window.app) window.app.refreshDashboard();
      } catch (err) {
        alert('Failed to process task capture: ' + err.message);
      }
    }
    // If 'IGNORE', do nothing and close
  }

  // --- Source Context Drawer (PRD Section 25) ---
  async openSourceContext(taskId) {
    const drawer = document.getElementById('drawer-source');
    if (!drawer) return;

    try {
      const res = await window.api.getTaskSource(taskId);
      const { task, sourceMessage } = res;

      document.getElementById('drawer-provider').textContent = task.source.toUpperCase();
      document.getElementById('drawer-sender').textContent = sourceMessage?.sender || 'Unknown Sender';
      document.getElementById('drawer-date').textContent = new Date(sourceMessage?.received_at || task.created_at).toLocaleString();

      const linkEl = document.getElementById('drawer-link');
      const urlContainer = document.getElementById('drawer-url-container');
      if (task.source_url) {
        linkEl.href = task.source_url;
        linkEl.textContent = `Open in ${task.source.toUpperCase()} ↗`;
        urlContainer.classList.remove('hidden');
      } else {
        urlContainer.classList.add('hidden');
      }

      document.getElementById('drawer-raw-text').textContent = sourceMessage?.content || task.description || 'No raw message body captured.';

      // Priority Breakdown
      const breakdownEl = document.getElementById('drawer-score-breakdown');
      if (breakdownEl) {
        breakdownEl.innerHTML = `
          <div class="score-breakdown-row" style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.82rem; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-muted)">Total Score:</span>
            <strong style="color: var(--accent-emerald)">${task.priority_score} / 125</strong>
          </div>
          <div class="score-breakdown-row" style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.82rem; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-muted)">Priority Tier:</span>
            <strong style="color: #fff">${task.priority}</strong>
          </div>
          <div class="score-breakdown-row" style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.82rem;">
            <span style="color: var(--text-muted)">User Adjustment:</span>
            <strong style="color: #fff">+${task.user_priority || 0} pts</strong>
          </div>
        `;
      }

      drawer.classList.remove('hidden');
    } catch (err) {
      console.error('Failed to load source context:', err);
      alert('Could not retrieve source context for this task.');
    }
  }

  closeSourceContext() {
    const drawer = document.getElementById('drawer-source');
    if (drawer) drawer.classList.add('hidden');
  }

  // --- Integrations Hub Modal ---
  async openIntegrationsModal() {
    const modal = document.getElementById('modal-integrations');
    const container = document.getElementById('integrations-list-container');
    if (!modal || !container) return;

    modal.classList.remove('hidden');
    container.innerHTML = `<p class="text-muted" style="padding: 20px 0;">Loading integrations status...</p>`;

    try {
      const res = await window.api.getIntegrations();
      const integrations = res.integrations || [];
      const providers = [
        { id: 'gmail', name: 'Gmail', icon: '✉️', desc: 'Syncs actionable work emails from your inbox' },
        { id: 'github', name: 'GitHub', icon: '🐙', desc: 'Monitors assigned issues and review requests' },
        { id: 'outlook', name: 'Outlook', icon: '📬', desc: 'Microsoft Graph mail obligation collector' },
        { id: 'teams', name: 'Microsoft Teams', icon: '💬', desc: 'Captures mentions and team chat requests' }
      ];

      container.innerHTML = providers.map(p => {
        const connected = integrations.some(i => i.provider === p.id && i.status === 'CONNECTED');
        return `
          <div class="integration-item" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span style="font-size: 1.8rem;">${p.icon}</span>
              <div>
                <h4 style="color: #fff; font-size: 0.98rem; margin-bottom: 2px;">${p.name}</h4>
                <p style="color: var(--text-muted); font-size: 0.8rem;">${p.desc}</p>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="status-indicator" style="font-size: 0.78rem; font-weight: 600; color: ${connected ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                ${connected ? '● Connected' : '○ Available'}
              </span>
              ${connected ? `<button class="btn-subtle btn-sync-integration" data-provider="${p.id}">Sync Now</button>` : `<button class="btn-secondary btn-connect-integration" data-provider="${p.id}">Connect</button>`}
            </div>
          </div>
        `;
      }).join('');

      // Bind sync triggers
      container.querySelectorAll('.btn-sync-integration').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const provider = (e.currentTarget).dataset.provider;
          btn.textContent = 'Syncing...';
          btn.disabled = true;
          try {
            const syncRes = await window.api.syncIntegration(provider);
            alert(`Sync complete! Fetched ${syncRes.fetchedCount} items, added ${syncRes.createdCount} new tasks.`);
            if (window.app) window.app.refreshDashboard();
          } catch (err) {
            alert(`Sync error: ${err.message}`);
          } finally {
            btn.textContent = 'Sync Now';
            btn.disabled = false;
          }
        });
      });

      // Bind connect triggers
      container.querySelectorAll('.btn-connect-integration').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const provider = (e.currentTarget).dataset.provider;
          await window.api.request(`/integrations/${provider}/connect`, { method: 'POST', body: {} });
          alert(`Successfully connected ${provider.toUpperCase()} integration.`);
          this.openIntegrationsModal();
          if (window.app) window.app.refreshDashboard();
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="text-red">Failed to load integrations: ${err.message}</p>`;
    }
  }

  closeIntegrationsModal() {
    const modal = document.getElementById('modal-integrations');
    if (modal) modal.classList.add('hidden');
  }
}

window.modals = new WorkRadarModals();
