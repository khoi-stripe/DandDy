// Unified AuthService for the DandDy app (manager + builder).
// Relies on `window.DanddyConfig` for API URLs & storage keys and exposes
// a single `window.AuthService` used across all views.

(function (global) {
  const cfg = global.DanddyConfig || {};
  const API_BASE_URL = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const TOKEN_KEY = cfg.TOKEN_STORAGE_KEY || 'dnd_auth_token';
  const USER_KEY = cfg.USER_STORAGE_KEY || 'dnd_user_info';
  const DEBUG = !!cfg.DEBUG;

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
      // Stop session monitoring before clearing tokens
      this.stopSessionMonitor();

      this.clearToken();
      // Clear any in-progress character builder session so it doesn't persist
      // and get offered to a different user who logs in later
      try {
        global.localStorage.removeItem('danddy_builder_session');
      } catch (e) {
        // Ignore errors (e.g., if localStorage is unavailable)
      }
    },

    // ===== Core HTTP helpers =====
    async _request(path, { method = 'GET', body, headers } = {}) {
      const url = `${API_BASE_URL}${path}`;
      const baseHeaders = headers || {};

      // Shallow-clone & scrub sensitive fields for debug logging
      const scrubBodyForLog = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        const clone = { ...payload };
        const sensitiveKeys = ['password', 'confirm_password', 'new_password', 'token'];
        sensitiveKeys.forEach((key) => {
          if (key in clone) {
            const value = String(clone[key] ?? '');
            clone[key] = value ? `*** (${value.length} chars)` : '***';
          }
        });
        return clone;
      };

      if (DEBUG) {
        console.log('[AuthService] HTTP request', {
          url,
          method,
          body: scrubBodyForLog(body),
        });
      }

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
          let backendDetail = null;
          try {
            const errJson = await response.json();
            if (DEBUG) {
              console.warn('[AuthService] HTTP error response', {
                url,
                status: response.status,
                payload: errJson,
              });
            }
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
              backendDetail = errJson.detail;
            }
          } catch (_) {
            // ignore JSON parse errors
          }
          if (DEBUG) {
            console.warn('[AuthService] HTTP request failed', {
              url,
              status: response.status,
              detail,
              backendDetail,
            });
          }
          throw new Error(detail);
        }

        // 204 no content
        if (response.status === 204) return null;
        const json = await response.json();
        if (DEBUG) {
          console.log('[AuthService] HTTP response OK', {
            url,
            method,
            status: response.status,
          });
        }
        return json;
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
      const url = `${API_BASE_URL}/auth/token`;
      if (DEBUG) {
        console.log('[AuthService] Login attempt', {
          url,
          email,
        });
      }

      try {
        const formData = new FormData();
        // Field name must remain "username" for OAuth2PasswordRequestForm,
        // but the value is the user's email address.
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(url, {
          method: 'POST',
          body: formData,
        });

        if (DEBUG) {
          console.log('[AuthService] Login response received', {
            url,
            status: response.status,
            ok: response.ok,
          });
        }

        if (!response.ok) {
          let detail = 'Login failed';
          let backendPayload = null;
          try {
            const errJson = await response.json();
            backendPayload = errJson;
            if (errJson && errJson.detail) detail = errJson.detail;
          } catch (_) {
            // ignore
          }
          if (DEBUG) {
            console.warn('[AuthService] Login HTTP error', {
              url,
              status: response.status,
              detail,
              backendPayload,
            });
          }
          throw new Error(detail);
        }

        const data = await response.json();
        if (!data || !data.access_token) {
          throw new Error('Login succeeded but no token was returned.');
        }

        if (DEBUG) {
          console.log('[AuthService] Login succeeded, token received', {
            url,
          });
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
      if (!token) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:fetchProfile',message:'No token available for profile fetch',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'missing_token_storage'})}).catch(()=>{});
        // #endregion
        return null;
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:fetchProfile',message:'Attempting to fetch profile with token',data:{tokenLength: token.length, tokenPrefix: token.substring(0, 20)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'token_validation_attempts'})}).catch(()=>{});
      // #endregion

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // 401: token invalid/expired
          if (response.status === 401) {
            let backendDetail = null;
            try {
              const errJson = await response.json();
              if (errJson && errJson.detail) {
                backendDetail = errJson.detail;
              }
            } catch (_) {
              // ignore JSON parse errors
            }

            console.warn(
              '[AuthService] Token rejected by /auth/me; handling unexpected logout.',
              {
                status: response.status,
                detail: backendDetail,
              }
            );

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:fetchProfile',message:'Token rejected by backend',data:{status: response.status, backendDetail},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'backend_token_rejection'})}).catch(()=>{});
            // #endregion

            this.handleUnexpectedLogout('auth_me_401');
            return null;
          }
          if (DEBUG) {
            console.warn('[AuthService] /auth/me non-401 error', {
              status: response.status,
            });
          }
          throw new Error('Failed to fetch user profile');
        }

        const profile = await response.json();
        if (DEBUG) {
          console.log('[AuthService] /auth/me profile loaded', profile);
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:fetchProfile',message:'Profile fetch successful',data:{userEmail: profile?.email},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'token_validation_attempts'})}).catch(()=>{});
        // #endregion

        return profile;
      } catch (error) {
        console.error('[AuthService] Fetch profile error:', error);

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:fetchProfile',message:'Profile fetch error',data:{error: error.message, isNetworkError: error.name === 'TypeError'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'network_fetch_failures'})}).catch(()=>{});
        // #endregion

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

    // ===== Session Monitoring =====
    // Proactively detect expired sessions and notify users before they attempt actions.

    _sessionCheckInterval: null,
    _lastSessionCheck: 0,
    _visibilityHandler: null,
    _sessionMonitorActive: false,

    // Check session every 5 minutes while active
    SESSION_CHECK_INTERVAL_MS: 5 * 60 * 1000,
    // Minimum 30 seconds between checks (cooldown for visibility changes)
    SESSION_CHECK_COOLDOWN_MS: 30 * 1000,

    /**
     * Start monitoring the session for expiry.
     * Call this after confirming the user is logged in.
     */
    startSessionMonitor() {
      if (this._sessionMonitorActive) {
        if (DEBUG) {
          console.log('[AuthService] Session monitor already active');
        }
        return;
      }

      if (!this.isAuthenticated()) {
        if (DEBUG) {
          console.log('[AuthService] Not authenticated, skipping session monitor');
        }
        return;
      }

      if (DEBUG) {
        console.log('[AuthService] Starting session monitor');
      }

      this._sessionMonitorActive = true;
      this._lastSessionCheck = Date.now();

      // Set up visibility change handler (check when user returns to tab)
      this._visibilityHandler = () => this._onVisibilityChange();
      document.addEventListener('visibilitychange', this._visibilityHandler);

      // Set up periodic background check
      this._sessionCheckInterval = setInterval(() => {
        this._performSessionCheck('interval');
      }, this.SESSION_CHECK_INTERVAL_MS);
    },

    /**
     * Stop monitoring the session.
     * Call this on logout or when cleaning up.
     */
    stopSessionMonitor() {
      if (DEBUG) {
        console.log('[AuthService] Stopping session monitor');
      }

      this._sessionMonitorActive = false;

      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }

      if (this._sessionCheckInterval) {
        clearInterval(this._sessionCheckInterval);
        this._sessionCheckInterval = null;
      }
    },

    /**
     * Handle visibility change events.
     * When the user returns to the tab, verify session is still valid.
     */
    _onVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return;
      }

      // Apply cooldown to avoid hammering the server
      const timeSinceLastCheck = Date.now() - this._lastSessionCheck;
      if (timeSinceLastCheck < this.SESSION_CHECK_COOLDOWN_MS) {
        if (DEBUG) {
          console.log('[AuthService] Skipping visibility check (cooldown)');
        }
        return;
      }

      this._performSessionCheck('visibility');
    },

    /**
     * Perform an actual session validity check.
     * @param {string} trigger - What triggered this check ('visibility' or 'interval')
     */
    async _performSessionCheck(trigger) {
      if (!this.isAuthenticated()) {
        // User logged out manually, stop monitoring
        this.stopSessionMonitor();
        return;
      }

      if (DEBUG) {
        console.log(`[AuthService] Performing session check (trigger: ${trigger})`);
      }

      this._lastSessionCheck = Date.now();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:_performSessionCheck',message:'Starting session check',data:{trigger, hasToken: !!this.getToken(), lastCheckAgo: Date.now() - this._lastSessionCheck},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'session_check_timing'})}).catch(()=>{});
      // #endregion

      try {
        const isValid = await this.verifyToken();

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:_performSessionCheck',message:'Session check result',data:{trigger, isValid, tokenExists: !!this.getToken()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'session_check_timing'})}).catch(()=>{});
        // #endregion

        if (!isValid) {
          if (DEBUG) {
            console.log('[AuthService] Session expired detected');
          }
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:_performSessionCheck',message:'Session expired, triggering logout',data:{trigger},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'session_check_false_positive'})}).catch(()=>{});
          // #endregion
          this._handleSessionExpired();
        } else if (DEBUG) {
          console.log('[AuthService] Session still valid');
        }
      } catch (error) {
        // Network error - don't treat as session expired (user might be offline)
        console.warn('[AuthService] Session check failed (network?):', error);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:_performSessionCheck',message:'Session check network error',data:{trigger, error: error.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'network_session_check_failures'})}).catch(()=>{});
        // #endregion
      }
    },

    /**
     * Handle an expired session: clear state, dispatch event, and update UI.
     */
    _handleSessionExpired() {
      // Stop monitoring (session is already dead)
      this.stopSessionMonitor();

      // Clear local auth state
      this.clearToken();

      // Dispatch custom event for UI components to react
      const event = new CustomEvent('danddy:sessionExpired', {
        detail: { reason: 'token_expired' },
      });
      window.dispatchEvent(event);

      // Also trigger the existing updateAuthUI if available
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
    },

    /**
     * Handle unexpected logout (e.g., 401 from API calls).
     * This should be called instead of clearToken() when a 401 is received.
     * It clears the auth state and notifies the user via the sessionExpired event.
     * @param {string} reason - Optional reason for the logout (for debugging)
     */
    handleUnexpectedLogout(reason = 'api_401') {
      // Prevent duplicate handling if already logged out
      if (!this.getToken()) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:handleUnexpectedLogout',message:'Unexpected logout called but no token present',data:{reason},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'duplicate_logout_calls'})}).catch(()=>{});
        // #endregion
        return;
      }

      if (DEBUG) {
        console.log('[AuthService] Handling unexpected logout:', reason);
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'danddy-auth.js:handleUnexpectedLogout',message:'Handling unexpected logout',data:{reason, hadToken: true, userInfo: this.getCurrentUser()?.email},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'unexpected_logout_triggers'})}).catch(()=>{});
      // #endregion

      // Stop session monitoring
      this.stopSessionMonitor();

      // Clear local auth state
      this.clearToken();

      // Dispatch custom event for UI components to react
      const event = new CustomEvent('danddy:sessionExpired', {
        detail: { reason },
      });
      window.dispatchEvent(event);

      // Also trigger the existing updateAuthUI if available
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
    },
  });
})(window);



