// Authentication UI screens for the DandDy terminal character builder.
// Exposes AuthUI as global on window.

const AuthUI = (window.AuthUI = {
  // Show login screen
  showLogin(onSuccess, onSwitchToRegister, onGuestMode) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    // Hide other content
    document.getElementById('splash-content')?.classList.add('is-hidden');
    document.getElementById('main-content')?.classList.add('is-hidden');

    // Create auth screen
    const authScreen = document.createElement('div');
    authScreen.id = 'auth-screen';
    authScreen.className = 'auth-screen';
    authScreen.innerHTML = `
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║     D&D CHARACTER BUILDER LOGIN       ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="login-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="login-password" class="terminal-input" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="password-toggle-btn" data-target="login-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div id="login-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="login-submit" class="button-primary">
              <span class="button-icon">▶</span> LOGIN
            </button>
            <button id="login-guest" class="button-secondary">
              <span class="button-icon">👤</span> CONTINUE AS GUEST
            </button>
          </div>
          
          <div class="auth-footer">
            <span class="auth-link" id="switch-to-register">
              Don't have an account? <span class="link-highlight">REGISTER HERE</span>
            </span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const passwordToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="login-password"]',
    );
    const submitButton = document.getElementById('login-submit');
    const guestButton = document.getElementById('login-guest');
    const switchButton = document.getElementById('switch-to-register');
    const errorDiv = document.getElementById('login-error');

    // Handle submit
    const handleSubmit = async () => {
      // Give password managers / autofill a brief moment to finish
      // populating fields before we read them. This avoids bogus
      // "Please enter both email and password" errors when the UI
      // *appears* filled in.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        this.showError(errorDiv, 'Please enter both email and password');
        return;
      }

      // Lightweight UI-side debug logging (never logs the raw password)
      try {
        const cfg = window.DanddyConfig || {};
        const debug = !!cfg.DEBUG;
        if (debug) {
          console.log('[AuthUI] Login submit clicked', {
            email,
            apiBaseUrl: cfg.API_BASE_URL,
          });
        }
      } catch (_) {
        // Ignore logging failures – never block login
      }

      this.showLoading(submitButton, true, 'AUTHENTICATING...');
      errorDiv.classList.add('is-hidden');

      try {
        const result = await AuthService.login(email, password);
        this.showLoading(submitButton, false);
        if (result && result.success) {
          this.removeAuthScreen();
          if (onSuccess) onSuccess(result.user);
        } else {
          this.showError(
            errorDiv,
            (result && result.error) || 'Login failed. Please try again.',
          );
        }
      } catch (error) {
        this.showLoading(submitButton, false);
        this.showError(errorDiv, error.message || 'Login failed. Please try again.');
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    if (passwordToggle && passwordInput) {
      passwordToggle.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        passwordToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        passwordToggle.setAttribute('aria-pressed', String(isPassword));
        passwordToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }
    
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    guestButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onGuestMode) onGuestMode();
    });

    switchButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onSwitchToRegister) onSwitchToRegister();
    });

    // Focus email input
    emailInput.focus();
  },

  // Show register screen
  showRegister(onSuccess, onSwitchToLogin) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    // Hide other content
    document.getElementById('splash-content')?.classList.add('is-hidden');
    document.getElementById('main-content')?.classList.add('is-hidden');

    // Create auth screen
    const authScreen = document.createElement('div');
    authScreen.id = 'auth-screen';
    authScreen.className = 'auth-screen';
    authScreen.innerHTML = `
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║   D&D CHARACTER BUILDER REGISTER      ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="register-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ CONFIRM PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password-confirm" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password-confirm" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ ROLE ]</label>
            <select id="register-role" class="terminal-select">
              <option value="player">Player</option>
              <option value="dm">Dungeon Master</option>
            </select>
          </div>
          
          <div id="register-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="register-submit" class="button-primary">
              <span class="button-icon">▶</span> CREATE ACCOUNT
            </button>
            <button id="register-cancel" class="button-secondary">
              <span class="button-icon">◀</span> BACK TO LOGIN
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-password-confirm');
    const passwordToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="register-password"]',
    );
    const confirmToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="register-password-confirm"]',
    );
    const roleSelect = document.getElementById('register-role');
    const submitButton = document.getElementById('register-submit');
    const cancelButton = document.getElementById('register-cancel');
    const errorDiv = document.getElementById('register-error');

    // Handle submit
    const handleSubmit = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;
      const role = roleSelect.value;

      if (!email || !password || !confirmPassword) {
        this.showError(errorDiv, 'Please fill in all fields');
        return;
      }

      if (password.length < 6) {
        this.showError(errorDiv, 'Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        this.showError(errorDiv, 'Passwords do not match');
        return;
      }

      this.showLoading(submitButton, true, 'CREATING ACCOUNT...');
      errorDiv.classList.add('is-hidden');

      try {
        const result = await AuthService.register(email, password, role);
        this.showLoading(submitButton, false);
        if (result && result.success) {
          this.removeAuthScreen();
          if (onSuccess) onSuccess(result.user);
        } else {
          this.showError(
            errorDiv,
            (result && result.error) ||
              'Registration failed. Please try again.',
          );
        }
      } catch (error) {
        this.showLoading(submitButton, false);
        this.showError(
          errorDiv,
          error.message || 'Registration failed. Please try again.',
        );
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    if (passwordToggle && passwordInput) {
      passwordToggle.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        passwordToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        passwordToggle.setAttribute('aria-pressed', String(isPassword));
        passwordToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }

    if (confirmToggle && confirmInput) {
      confirmToggle.addEventListener('click', () => {
        const isPassword = confirmInput.type === 'password';
        confirmInput.type = isPassword ? 'text' : 'password';
        confirmToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        confirmToggle.setAttribute('aria-pressed', String(isPassword));
        confirmToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }
    
    confirmInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    cancelButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onSwitchToLogin) onSwitchToLogin();
    });

    // Focus email input
    emailInput.focus();
  },

  // Helper: Show error message
  showError(errorDiv, message) {
    errorDiv.textContent = `⚠ ERROR: ${message}`;
    errorDiv.classList.remove('is-hidden');
  },

  // Helper: Show/hide loading on a primary button
  showLoading(button, show, label) {
    if (!button) return;

    if (show) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.innerHTML;
      }
      button.disabled = true;
      const loadingLabel = label || 'WORKING...';
      const cubeMarkup = 
        '<span class="spinner-cube-scene">' +
        '<span class="spinner-cube-tilt">' +
        '<span class="spinner-cube">' +
        '<span class="spinner-cube-face spinner-cube-face-front"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-back"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-right"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-left"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-top"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-bottom"></span>' +
        '</span></span></span>';
      button.innerHTML = `${cubeMarkup} ${loadingLabel}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  },

  // Helper: Remove auth screen
  removeAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
      authScreen.remove();
    }
  },

  // Show user info in header
  updateHeaderWithUser(user) {
    const statusText = document.getElementById('status-text');
    if (statusText && user) {
      const roleIcon = user.role === 'dm' ? '🎲' : '⚔️';
      const label = (user.email || '').toUpperCase();
      statusText.innerHTML = `${roleIcon} ${label} | <button class="link-button" id="header-characters">MY CHARACTERS</button> | <button class="link-button" id="header-logout">LOGOUT</button>`;
      
      // Add characters button handler
      document.getElementById('header-characters')?.addEventListener('click', () => {
        CharacterManager.show();
      });
      
      // Add logout handler
      document.getElementById('header-logout')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
          AuthService.logout();
          window.location.reload();
        }
      });
    }
  },

  // Show guest mode banner
  showGuestBanner() {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.innerHTML = `👤 GUEST MODE | <button class="link-button" id="header-login">LOGIN TO SAVE</button>`;
      
      // Add login handler
      document.getElementById('header-login')?.addEventListener('click', () => {
        App.showAuthScreen();
      });
    }
  },
});

