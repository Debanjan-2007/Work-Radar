/**
 * Work Radar Reminders & Notifications Client
 */
class WorkRadarRemindersClient {
  constructor() {
    this.alerts = [];
    this.requestBrowserNotificationPermission();
  }

  requestBrowserNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  async loadReminders() {
    try {
      const res = await window.api.getReminders();
      this.alerts = res.alerts || [];
      this.updateBadge();
      this.renderDrawer();
    } catch (err) {
      console.warn('[Reminders] Failed to load reminders:', err);
    }
  }

  updateBadge() {
    const badge = document.getElementById('badge-reminder-count');
    if (!badge) return;

    if (this.alerts.length > 0) {
      badge.textContent = this.alerts.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  renderDrawer() {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (this.alerts.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 10px; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 10px;">✨</div>
          <p>No new alerts. Your radar notifications are all clear.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.alerts.map(alert => `
      <div class="notification-item ${alert.trigger_type === 'CRITICAL_ALERT' ? 'border-red' : ''}" style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <p style="font-size: 0.88rem; color: #fff; line-height: 1.4;">${this.escapeHtml(alert.message)}</p>
          <button class="btn-subtle btn-ack-alert" data-alert-id="${alert.id}" style="padding: 2px 8px; font-size: 0.75rem;">Dismiss</button>
        </div>
        <span style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-top: 6px;">
          ${new Date(alert.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    `).join('');

    // Bind dismiss handlers
    list.querySelectorAll('.btn-ack-alert').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.currentTarget).dataset.alertId;
        await window.api.acknowledgeReminder(id);
        this.alerts = this.alerts.filter(a => a.id !== id);
        this.updateBadge();
        this.renderDrawer();
      });
    });
  }

  toggleDrawer() {
    const drawer = document.getElementById('drawer-notifications');
    if (!drawer) return;

    if (drawer.classList.contains('hidden')) {
      drawer.classList.remove('hidden');
      this.loadReminders();
    } else {
      drawer.classList.add('hidden');
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

window.reminders = new WorkRadarRemindersClient();
