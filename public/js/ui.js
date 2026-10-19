/**
 * Work Radar UI Renderer
 */
class WorkRadarUI {
  constructor() {
    this.currentNextTaskId = null;
  }

  // Format relative deadline string
  formatDeadline(dateString) {
    if (!dateString) return 'No Deadline';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMs < 0) {
      return `Overdue by ${Math.abs(diffHours)}h`;
    }
    if (diffHours <= 24) {
      return `Due Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffHours <= 48) {
      return 'Due Tomorrow';
    }
    const days = Math.round(diffHours / 24);
    return `Due in ${days} days`;
  }

  // Get provider visual icon
  getProviderIcon(provider) {
    const p = (provider || '').toLowerCase();
    switch (p) {
      case 'gmail': return '✉️';
      case 'github': return '🐙';
      case 'outlook': return '📬';
      case 'teams': return '💬';
      case 'chrome':
      case 'website': return '🌐';
      default: return '✍️';
    }
  }

  // Render "DO THIS NOW" hero card
  renderDoThisNow(task) {
    const card = document.getElementById('do-this-now-card');
    if (!card) return;

    if (!task) {
      this.currentNextTaskId = null;
      card.innerHTML = `
        <div class="hero-card-inner text-center" style="justify-content: center; padding: 20px 0;">
          <div style="text-align: center;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">🎯</div>
            <h2 style="font-family: var(--font-display); font-size: 1.4rem; color: #fff; margin-bottom: 6px;">All Radar Tasks Cleared!</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">You have completed all pending obligations. Use "Capture Work" to ingest new tasks.</p>
          </div>
        </div>
      `;
      return;
    }

    this.currentNextTaskId = task.id;

    // Badges
    const tierBadge = document.getElementById('dtn-tier-badge');
    if (tierBadge) {
      tierBadge.textContent = `${task.priority} PRIORITY`;
      tierBadge.className = `tier-badge tier-${(task.priority || 'high').toLowerCase()}`;
    }

    const sourceBadge = document.getElementById('dtn-source-badge');
    if (sourceBadge) {
      sourceBadge.innerHTML = `<span class="source-icon">${this.getProviderIcon(task.source)}</span> ${task.source.toUpperCase()}`;
    }

    const deadlineBadge = document.getElementById('dtn-deadline-badge');
    if (deadlineBadge) {
      deadlineBadge.textContent = this.formatDeadline(task.deadline);
      if (task.deadline && new Date(task.deadline).getTime() < Date.now()) {
        deadlineBadge.className = 'deadline-badge text-red';
      }
    }

    // Titles & details
    const titleEl = document.getElementById('dtn-task-title');
    if (titleEl) titleEl.textContent = task.title;

    const descEl = document.getElementById('dtn-task-desc');
    if (descEl) descEl.textContent = task.description || 'Actionable task obligation captured by Work Radar.';

    const reasonEl = document.getElementById('dtn-reason-text');
    if (reasonEl) reasonEl.textContent = `"${task.reason || 'Calculated as your single highest-priority task right now.'}"`;

    // Score & Radial Gauge
    const scoreVal = document.getElementById('dtn-score-number');
    if (scoreVal) scoreVal.textContent = task.priority_score;

    const gaugeBar = document.getElementById('dtn-gauge-bar');
    if (gaugeBar) {
      // Circumference = 2 * PI * 42 ≈ 264
      const circumference = 264;
      const progress = Math.min(1, Math.max(0, task.priority_score / 125));
      const offset = circumference - (progress * circumference);
      gaugeBar.style.strokeDashoffset = offset;

      if (task.priority === 'CRITICAL') {
        gaugeBar.style.stroke = 'var(--accent-red)';
      } else if (task.priority === 'HIGH') {
        gaugeBar.style.stroke = 'var(--accent-emerald)';
      } else {
        gaugeBar.style.stroke = 'var(--primary)';
      }
    }

    // Update Start Button status
    const startBtn = document.getElementById('btn-start-dtn');
    if (startBtn) {
      if (task.status === 'IN_PROGRESS') {
        startBtn.innerHTML = `<span>IN PROGRESS...</span>`;
        startBtn.style.background = 'linear-gradient(135deg, var(--primary) 0%, #0284c7 100%)';
      } else {
        startBtn.innerHTML = `<span>START WORK</span> <span class="arrow-icon">➔</span>`;
        startBtn.style.background = 'linear-gradient(135deg, var(--accent-emerald) 0%, #059669 100%)';
      }
    }
  }

  // Render Status Ribbon counters
  renderWorkStatus(status) {
    if (!status) return;
    const map = {
      'stat-remaining': status.remaining,
      'stat-due-today': status.dueToday,
      'stat-overdue': status.overdue,
      'stat-in-progress': status.inProgress,
      'stat-waiting': status.waiting,
      'stat-completed': status.completedToday
    };

    for (const [id, count] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    }
  }

  // Render Queue Lists (Tiered)
  renderQueue(tasks, filterSource = 'all', searchQuery = '') {
    const listHigh = document.getElementById('list-tier-high');
    const listMed = document.getElementById('list-tier-med');
    const listLow = document.getElementById('list-tier-low');

    if (!listHigh || !listMed || !listLow) return;

    listHigh.innerHTML = '';
    listMed.innerHTML = '';
    listLow.innerHTML = '';

    // Filter by source and search
    let filtered = tasks;
    if (filterSource !== 'all') {
      filtered = filtered.filter(t => (t.source || '').toLowerCase() === filterSource.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    }

    let countHigh = 0;
    let countMed = 0;
    let countLow = 0;

    for (const task of filtered) {
      const card = this.createTaskCardElement(task);

      if (task.priority_score >= 80) {
        listHigh.appendChild(card);
        countHigh++;
      } else if (task.priority_score >= 40) {
        listMed.appendChild(card);
        countMed++;
      } else {
        listLow.appendChild(card);
        countLow++;
      }
    }

    // Update tier count badges
    const cHighEl = document.getElementById('count-tier-high');
    if (cHighEl) cHighEl.textContent = countHigh;

    const cMedEl = document.getElementById('count-tier-med');
    if (cMedEl) cMedEl.textContent = countMed;

    const cLowEl = document.getElementById('count-tier-low');
    if (cLowEl) cLowEl.textContent = countLow;

    // Empty state handlers
    if (countHigh === 0) listHigh.innerHTML = '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">No active tasks in this tier.</p>';
    if (countMed === 0) listMed.innerHTML = '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">No active tasks in this tier.</p>';
    if (countLow === 0) listLow.innerHTML = '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">No low priority tasks.</p>';
  }

  createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.status === 'IN_PROGRESS' ? 'in-progress' : ''} ${task.status === 'COMPLETED' ? 'completed' : ''}`;
    card.dataset.taskId = task.id;

    const isTopTask = this.currentNextTaskId === task.id;
    const scoreColorClass = task.priority_score >= 80 ? 'tier-high' : (task.priority_score >= 40 ? 'tier-med' : 'tier-low');

    card.innerHTML = `
      <div class="task-card-left">
        <div class="task-score-pill ${scoreColorClass}" title="Priority Score">
          ${task.priority_score}
        </div>
        <div class="task-details">
          <div class="task-title">
            ${isTopTask ? '<span title="Top-ranked Do This Now task" style="margin-right: 4px;">⚡</span>' : ''}
            ${this.escapeHtml(task.title)}
          </div>
          <div class="task-meta">
            <span>${this.getProviderIcon(task.source)} ${task.source.toUpperCase()}</span>
            <span>•</span>
            <span class="${task.deadline && new Date(task.deadline).getTime() < Date.now() ? 'text-red font-bold' : ''}">
              ${this.formatDeadline(task.deadline)}
            </span>
            ${task.status === 'IN_PROGRESS' ? '<span class="text-cyan font-bold">• IN PROGRESS</span>' : ''}
          </div>
        </div>
      </div>
      <div class="task-card-right">
        ${task.status !== 'IN_PROGRESS' ? `<button class="btn-subtle btn-task-start" title="Start Task">Start</button>` : ''}
        <button class="btn-subtle btn-task-complete" title="Mark Completed">✓</button>
        <button class="btn-subtle btn-task-snooze" title="Snooze 24h">⏰</button>
        <button class="btn-subtle btn-task-context" title="View Source Context">🔍</button>
      </div>
    `;

    return card;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

window.ui = new WorkRadarUI();
