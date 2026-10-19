/**
 * Work Radar API Client
 * Wraps REST endpoints with credential handling, CSRF token attachment, and error handling.
 */
class WorkRadarApi {
  constructor() {
    this.baseUrl = '/api/v1';
    this.csrfToken = this.getCsrfTokenFromCookie();
  }

  getCsrfTokenFromCookie() {
    const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
    return match ? match[2] : '';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Work-Radar-Client': 'web-dashboard',
      ...(this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers,
      credentials: 'same-origin'
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // Auto authenticate demo user in development
        await this.loginDemoUser();
        return this.request(endpoint, options);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[API Error] ${endpoint}:`, error);
      throw error;
    }
  }

  async loginDemoUser() {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex.developer@workradar.io' })
    });
    const data = await res.json();
    this.csrfToken = data.csrfToken;
    return data;
  }

  // Tasks API
  async getNextTask() {
    return this.request('/tasks/next');
  }

  async getPriorityQueue() {
    return this.request('/tasks/priority');
  }

  async getWorkStatus() {
    return this.request('/tasks/status');
  }

  async getTasks(filter = {}) {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.source) params.set('source', filter.source);
    return this.request(`/tasks?${params.toString()}`);
  }

  async createTask(taskData) {
    return this.request('/tasks', { method: 'POST', body: taskData });
  }

  async startTask(id) {
    return this.request(`/tasks/${id}/start`, { method: 'POST' });
  }

  async completeTask(id) {
    return this.request(`/tasks/${id}/complete`, { method: 'POST' });
  }

  async snoozeTask(id, until) {
    return this.request(`/tasks/${id}/snooze`, { method: 'POST', body: { until } });
  }

  async recalculateAll() {
    return this.request('/tasks/recalculate-priority', { method: 'POST' });
  }

  async getTaskSource(id) {
    return this.request(`/tasks/${id}/source`);
  }

  // Capture API
  async captureContent(payload) {
    return this.request('/capture', { method: 'POST', body: payload });
  }

  // Integrations API
  async getIntegrations() {
    return this.request('/integrations');
  }

  async syncIntegration(provider) {
    return this.request(`/integrations/${provider}/sync`, { method: 'POST' });
  }

  async getIntegrationHealth() {
    return this.request('/integrations/health');
  }

  // Reminders API
  async getReminders() {
    return this.request('/reminders');
  }

  async acknowledgeReminder(id) {
    return this.request(`/reminders/${id}/acknowledge`, { method: 'POST' });
  }

  // Voice API
  async sendVoiceCommand(transcript) {
    return this.request('/voice/command', { method: 'POST', body: { transcript } });
  }
}

window.api = new WorkRadarApi();
