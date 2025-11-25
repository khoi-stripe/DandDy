// Unified AuthService for the DandDy app (manager + builder).
// Relies on `window.DanddyConfig` for API URLs & storage keys and exposes
// a single `window.AuthService` used across all views.

(function (global) {
  const cfg = global.DanddyConfig || {};
  const API_BASE_URL = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const TOKEN_KEY = cfg.TOKEN_STORAGE_KEY || 'dnd_auth_token';
  const USER_KEY = cfg.USER_STORAGE_KEY || 'dnd_user_info';

  const AuthService = (global.AuthService = global.AuthService || {});

  Object.assign(AuthService, {
    TOKEN_KEY,
    USER_KEY,

    // ===== Local session helpers =====
    getToken() {
      return global.localStorage.getItem(this.TOKEN_KEY);
    },

    setToken(token) {
      if (!token) return;
      global.localStorage.setItem(this.TOKEN_KEY, token);
    },

    clearToken() {
      global.localStorage.removeItem(this.TOKEN_KEY);
      global.localStorage.removeItem(this.USER_KEY);
    },

    getCurrentUser() {
      const raw = global.localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    },

    setCurrentUser(user) {
      if (!user) return;
      global.localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    isAuthenticated() {
      return !!this.getToken();
    },

    logout() {
      this.clearToken();
    },

    // ===== Core HTTP helpers =====
    async _request(path, { method = 'GET', body, headers } = {}) {
      const url = `${API_BASE_URL}${path}`;
      const baseHeaders = headers || {};

      try {
        const response = await fetch(url, {
          method,
          headers: body
            ? { 'Content-Type': 'application/json', ...baseHeaders }
            : baseHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          let detail = `Request failed (${response.status})`;
          try {
            const errJson = await response.json();
            if (errJson && errJson.detail) {
              if (typeof errJson.detail === 'string') {
                // Simple error string from backend
                detail = errJson.detail;
              } else if (Array.isArray(errJson.detail) && errJson.detail.length) {
                // FastAPI validation error format: [{ loc, msg, type }, ...]
                const first = errJson.detail[0];
                if (first && first.msg) {
                  detail = first.msg;
                } else {
                  detail = JSON.stringify(errJson.detail);
                }
              } else {
                // Fallback to JSON string so we don't show [object Object]
                detail = JSON.stringify(errJson.detail);
              }
            }
          } catch (_) {
            // ignore JSON parse errors
          }
          throw new Error(detail);
        }

        // 204 no content
        if (response.status === 204) return null;
        return await response.json();
      } catch (error) {
        console.error('[AuthService] Request error:', error);
        throw error;
      }
    },

    // ===== Auth flows =====

    /**
     * Register a new user using email + password.
     * Returns { success, user, error }.
     *
     * For backward-compatibility with older backend deployments that still
     * expect a `username` field, we derive a simple username from the email
     * (typically the part before "@"). Newer backends that ignore usernames
     * will simply drop this extra field.
     */
    async register(email, password, role = 'player') {
      try {
        const derivedUsername =
          typeof email === 'string' && email.includes('@')
            ? email.split('@')[0]
            : email;

        const data = await this._request('/auth/register', {
          method: 'POST',
          // Backend identifies accounts by email only; username is legacy.
          // Sending both keeps us compatible with older API versions.
          body: { username: derivedUsername, email, password, role },
        });

        if (!data || !data.access_token) {
          throw new Error('Registration succeeded but no token was returned.');
        }

        this.setToken(data.access_token);

        // Try to fetch full user profile; fall back to a minimal email-only object.
        const profile = await this.fetchProfile();
        const user =
          profile && Object.keys(profile).length
            ? profile
            : { email, role };

        this.setCurrentUser(user);

        return { success: true, user };
      } catch (error) {
        return { success: false, error: error.message || 'Registration failed' };
      }
    },

    /**
     * Login with email + password.
     *
     * Note: the OAuth2 password flow still uses the `username` form field name,
     * but this value is always interpreted as an email address by the backend.
     * Returns { success, user, error }.
     */
    async login(email, password) {
      try {
        const formData = new FormData();
        // Field name must remain "username" for OAuth2PasswordRequestForm,
        // but the value is the user's email address.
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/auth/token`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let detail = 'Login failed';
          try {
            const errJson = await response.json();
            if (errJson && errJson.detail) detail = errJson.detail;
          } catch (_) {
            // ignore
          }
          throw new Error(detail);
        }

        const data = await response.json();
        if (!data || !data.access_token) {
          throw new Error('Login succeeded but no token was returned.');
        }

        this.setToken(data.access_token);
        const profile = await this.fetchProfile();
        if (profile) {
          this.setCurrentUser(profile);
        }

        return { success: true, user: profile };
      } catch (error) {
        console.error('[AuthService] Login error:', error);
        return { success: false, error: error.message || 'Login failed' };
      }
    },

    /**
     * Request a password reset email.
     */
    async forgotPassword(email) {
      try {
        const data = await this._request('/auth/password/forgot', {
          method: 'POST',
          body: { email },
        });

        return {
          success: true,
          message:
            (data && data.message) ||
            'If an account with that email exists, a password reset link has been sent.',
          debugToken: data && data.debug_reset_token ? data.debug_reset_token : null,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message || 'Password reset request failed',
        };
      }
    },

    /**
     * Complete a password reset given a reset token and new password.
     */
    async resetPassword(token, newPassword) {
      try {
        const data = await this._request('/auth/password/reset', {
          method: 'POST',
          body: { token, new_password: newPassword },
        });

        if (!data || !data.access_token) {
          throw new Error('Password reset succeeded but no token was returned.');
        }

        this.setToken(data.access_token);
        const profile = await this.fetchProfile();
        if (profile) {
          this.setCurrentUser(profile);
        }

        return { success: true, user: profile };
      } catch (error) {
        return { success: false, error: error.message || 'Password reset failed' };
      }
    },

    /**
     * Fetch current user profile using stored access token.
     */
    async fetchProfile() {
      const token = this.getToken();
      if (!token) return null;

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // 401: token invalid/expired
          if (response.status === 401) {
            this.clearToken();
            return null;
          }
          throw new Error('Failed to fetch user profile');
        }

        return await response.json();
      } catch (error) {
        console.error('[AuthService] Fetch profile error:', error);
        return null;
      }
    },

    /**
     * Verify token validity by calling /auth/me.
     * Returns true if still valid, false otherwise.
     */
    async verifyToken() {
      const profile = await this.fetchProfile();
      return !!profile;
    },
  });
})(window);



