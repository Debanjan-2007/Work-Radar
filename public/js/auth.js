/**
 * Work Radar — Client-Side Auth Guard
 *
 * Responsibilities:
 *  1. On page load: verify session via /api/v1/auth/me
 *     - If not authenticated (401) in production → redirect to /login.html
 *     - If authenticated  → inject user avatar + name into header
 *  2. Intercept 401 responses from WorkRadarApi to re-trigger login redirect
 *  3. Provide window.authState for other scripts to read user info
 *  4. Wire up the sign-out button
 */

class AuthGuard {
  constructor() {
    this.user = null;
  }

  /** Called once on page load. Returns true if the user is authenticated. */
  async init() {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });

      if (res.status === 401) {
        // In production this means no valid session — send to login
        this._redirectToLogin();
        return false;
      }

      if (!res.ok) {
        console.warn('[AuthGuard] /auth/me returned', res.status, '— proceeding (dev mode assumed).');
        return true;
      }

      const data = await res.json();
      if (!data.user || !data.user.id) {
        // Likely dev demo mode — still let the dashboard load
        this.user = data.user || null;
        return true;
      }

      this.user = data.user;
      this._injectUserUI();
      return true;
    } catch (err) {
      console.warn('[AuthGuard] Network error checking session:', err);
      // Allow app to proceed in dev/offline mode
      return true;
    }
  }

  /** Redirect the browser to the login page. */
  _redirectToLogin() {
    const current = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login.html?next=${current}`);
  }

  /** Inject authenticated user UI into the header. */
  _injectUserUI() {
    const user = this.user;
    if (!user) return;

    // Find the header-actions container
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;

    // Build user chip HTML
    const avatarHtml = user.avatarUrl
      ? `<img src="${this._esc(user.avatarUrl)}" alt="${this._esc(user.name)}" class="user-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
      : '';

    const initials = (user.name || user.email || 'U')
      .split(' ')
      .slice(0, 2)
      .map(p => p[0])
      .join('')
      .toUpperCase();

    const userChip = document.createElement('div');
    userChip.className = 'user-chip';
    userChip.id = 'user-chip';
    userChip.innerHTML = `
      <div class="user-avatar">
        ${avatarHtml}
        <span class="user-avatar-initials" style="${user.avatarUrl ? 'display:none' : ''}">${this._esc(initials)}</span>
      </div>
      <div class="user-info">
        <span class="user-name">${this._esc(user.name || user.email)}</span>
        <span class="user-email">${this._esc(user.email)}</span>
      </div>
      <div class="user-dropdown" id="user-dropdown">
        <button id="btn-sign-out" class="dropdown-item dropdown-item-danger">
          <span>⎋</span> Sign Out
        </button>
      </div>
    `;

    // Insert at the start of header-actions
    headerActions.insertBefore(userChip, headerActions.firstChild);

    // Toggle dropdown
    userChip.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown) dropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown) dropdown.classList.remove('open');
    });

    // Sign-out
    document.addEventListener('click', async (e) => {
      if (e.target && (e.target.id === 'btn-sign-out' || e.target.closest('#btn-sign-out'))) {
        await this.signOut();
      }
    });
  }

  async signOut() {
    try {
      // Use existing CSRF token from cookie
      const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || '';
      await fetch('/api/v1/oauth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        }
      });
    } catch (_) { /* ignore */ }
    window.location.replace('/login.html');
  }

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Inject user chip CSS into the document head
(function injectAuthStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .user-chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px 6px 6px;
      border-radius: 99px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      cursor: pointer;
      transition: background 0.18s ease, border-color 0.18s ease;
      user-select: none;
    }
    .user-chip:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(6,182,212,0.3);
    }

    .user-avatar {
      width: 30px; height: 30px;
      border-radius: 50%;
      overflow: hidden;
      background: rgba(6,182,212,0.2);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .user-avatar-img  { width: 100%; height: 100%; object-fit: cover; }
    .user-avatar-initials {
      font-size: 0.75rem;
      font-weight: 700;
      color: #06b6d4;
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .user-name  { font-size: 0.8rem; font-weight: 600; color: #f8fafc; }
    .user-email { font-size: 0.7rem; color: #64748b; }

    .user-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 160px;
      background: rgba(13,19,33,0.97);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 12px;
      padding: 6px;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .user-dropdown.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: #94a3b8;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      font-family: inherit;
    }
    .dropdown-item:hover { background: rgba(255,255,255,0.06); color: #f8fafc; }
    .dropdown-item-danger:hover { background: rgba(239,68,68,0.10); color: #fca5a5; }
  `;
  document.head.appendChild(style);
})();

// Instantiate and run auth guard before the app starts
window.authGuard = new AuthGuard();

// The DOMContentLoaded listener in app.js calls window.app.init().
// We intercept that by adding our auth check first.
const _originalAddEventListener = document.addEventListener.bind(document);
let _authInitialized = false;
let _authResult = true;

// Override DOMContentLoaded to inject auth check before app init
document.addEventListener = function (type, listener, options) {
  if (type === 'DOMContentLoaded') {
    _originalAddEventListener('DOMContentLoaded', async function wrappedListener(e) {
      if (!_authInitialized) {
        _authInitialized = true;
        _authResult = await window.authGuard.init();
      }
      if (_authResult) {
        listener(e);
      }
    }, options);
    return;
  }
  return _originalAddEventListener(type, listener, options);
};
