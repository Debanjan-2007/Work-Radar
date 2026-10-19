/**
 * Work Radar Main Application Controller
 */
class WorkRadarApp {
  constructor() {
    this.allTasks = [];
    this.currentSourceFilter = 'all';
    this.currentStatusFilter = 'all';
    this.searchQuery = '';
    this.recalcTimer = null;
  }

  async init() {
    console.log('[Work Radar] Initializing application dashboard...');
    this.bindEvents();
    await this.refreshDashboard();

    // Periodic background priority re-evaluation ticker (Section 22)
    this.recalcTimer = setInterval(() => {
      this.refreshDashboard(true);
    }, 60000);
  }

  async refreshDashboard(silent = false) {
    try {
      if (!silent) {
        document.body.style.cursor = 'wait';
      }

      // 1. Fetch Do This Now Top Task
      const nextRes = await window.api.getNextTask();
      window.ui.renderDoThisNow(nextRes.task);

      // 2. Fetch Active Priority Queue
      const queueRes = await window.api.getPriorityQueue();
      this.allTasks = queueRes.tasks || [];
      window.ui.renderQueue(this.allTasks, this.currentSourceFilter, this.searchQuery);

      // 3. Fetch Work Status Ribbon
      const statusRes = await window.api.getWorkStatus();
      window.ui.renderWorkStatus(statusRes.status);

      // 4. Fetch Reminders
      await window.reminders.loadReminders();
    } catch (err) {
      console.error('[Work Radar] Error refreshing dashboard:', err);
    } finally {
      document.body.style.cursor = 'default';
    }
  }

  bindEvents() {
    // --- Header Actions ---
    document.getElementById('btn-open-capture')?.addEventListener('click', () => {
      window.modals.openCaptureModal();
    });

    document.getElementById('btn-open-integrations')?.addEventListener('click', () => {
      window.modals.openIntegrationsModal();
    });

    document.getElementById('btn-notifications')?.addEventListener('click', () => {
      window.reminders.toggleDrawer();
    });

    document.getElementById('btn-voice-assistant')?.addEventListener('click', () => {
      window.voice.openVoiceModal();
    });

    document.getElementById('btn-recalculate-all')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-recalculate-all');
      if (btn) btn.innerHTML = '<span class="spinner"></span> Recalculating...';
      try {
        const res = await window.api.recalculateAll();
        await this.refreshDashboard();
      } finally {
        if (btn) btn.innerHTML = '<span class="btn-icon-prefix">⚡</span><span>Recalculate</span>';
      }
    });

    // --- "DO THIS NOW" Card Actions ---
    document.getElementById('btn-start-dtn')?.addEventListener('click', async () => {
      if (window.ui.currentNextTaskId) {
        await window.api.startTask(window.ui.currentNextTaskId);
        await this.refreshDashboard();
      }
    });

    document.getElementById('btn-complete-dtn')?.addEventListener('click', async () => {
      if (window.ui.currentNextTaskId) {
        await window.api.completeTask(window.ui.currentNextTaskId);
        await this.refreshDashboard();
      }
    });

    document.getElementById('btn-snooze-dtn')?.addEventListener('click', async () => {
      if (window.ui.currentNextTaskId) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await window.api.snoozeTask(window.ui.currentNextTaskId, tomorrow);
        await this.refreshDashboard();
      }
    });

    document.getElementById('btn-source-dtn')?.addEventListener('click', () => {
      if (window.ui.currentNextTaskId) {
        window.modals.openSourceContext(window.ui.currentNextTaskId);
      }
    });

    // --- Task Cards List Delegated Actions ---
    document.querySelector('.queue-tiers-container')?.addEventListener('click', async (e) => {
      const target = e.target;
      const card = target.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;

      if (target.closest('.btn-task-start')) {
        e.stopPropagation();
        await window.api.startTask(taskId);
        await this.refreshDashboard();
      } else if (target.closest('.btn-task-complete')) {
        e.stopPropagation();
        await window.api.completeTask(taskId);
        await this.refreshDashboard();
      } else if (target.closest('.btn-task-snooze')) {
        e.stopPropagation();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await window.api.snoozeTask(taskId, tomorrow);
        await this.refreshDashboard();
      } else if (target.closest('.btn-task-context') || card) {
        window.modals.openSourceContext(taskId);
      }
    });

    // --- Status Ribbon Filter Clicks ---
    document.querySelectorAll('.status-pill').forEach(pill => {
      pill.addEventListener('click', async (e) => {
        document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const filter = pill.dataset.filter;
        this.currentStatusFilter = filter;

        if (filter === 'completed') {
          const res = await window.api.getTasks({ status: 'COMPLETED' });
          window.ui.renderQueue(res.tasks || [], this.currentSourceFilter, this.searchQuery);
        } else if (filter === 'in-progress') {
          const res = await window.api.getTasks({ status: 'IN_PROGRESS' });
          window.ui.renderQueue(res.tasks || [], this.currentSourceFilter, this.searchQuery);
        } else {
          window.ui.renderQueue(this.allTasks, this.currentSourceFilter, this.searchQuery);
        }
      });
    });

    // --- Source Filter Chips ---
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentSourceFilter = chip.dataset.source;
        window.ui.renderQueue(this.allTasks, this.currentSourceFilter, this.searchQuery);
      });
    });

    // --- Live Search Input ---
    document.getElementById('input-search-tasks')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      window.ui.renderQueue(this.allTasks, this.currentSourceFilter, this.searchQuery);
    });

    // --- Capture Form Submission ---
    document.getElementById('form-capture')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = document.getElementById('capture-content').value;
      const source = document.getElementById('capture-source').value;
      const url = document.getElementById('capture-url').value;
      const submitBtn = document.getElementById('btn-submit-capture');
      const spinner = document.getElementById('capture-submit-spinner');

      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');

      try {
        const res = await window.api.captureContent({ content, source, url });

        if (!res.actionable) {
          alert(res.message || 'Filtered: This content does not appear to contain actionable work.');
          return;
        }

        if (res.isDuplicate) {
          // Show PRD Section 24 duplicate arbitration dialog
          window.modals.showDuplicatePrompt(res.duplicateDetails, {
            content,
            source,
            url,
            extractedTitle: res.extracted?.title
          });
          return;
        }

        window.modals.closeCaptureModal();
        document.getElementById('form-capture').reset();
        await this.refreshDashboard();
      } catch (err) {
        alert('Failed to capture task: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
      }
    });

    // --- Modal Close Buttons ---
    document.getElementById('btn-close-capture')?.addEventListener('click', () => window.modals.closeCaptureModal());
    document.getElementById('btn-cancel-capture')?.addEventListener('click', () => window.modals.closeCaptureModal());
    document.getElementById('btn-close-dup')?.addEventListener('click', () => window.modals.closeDuplicateModal());
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => window.modals.closeSourceContext());
    document.getElementById('btn-close-integrations')?.addEventListener('click', () => window.modals.closeIntegrationsModal());
    document.getElementById('btn-close-notifications')?.addEventListener('click', () => window.reminders.toggleDrawer());
    document.getElementById('btn-close-voice')?.addEventListener('click', () => window.voice.closeVoiceModal());

    // --- Duplicate Dialog Actions ---
    document.getElementById('btn-dup-merge')?.addEventListener('click', () => window.modals.resolveDuplicate('MERGE'));
    document.getElementById('btn-dup-separate')?.addEventListener('click', () => window.modals.resolveDuplicate('SEPARATE'));
    document.getElementById('btn-dup-ignore')?.addEventListener('click', () => window.modals.resolveDuplicate('IGNORE'));

    // --- Voice Prompt Quick Buttons ---
    document.querySelectorAll('.prompt-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const prompt = e.currentTarget.dataset.voicePrompt;
        window.voice.executeVoiceCommand(prompt);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new WorkRadarApp();
  window.app.init();
});
