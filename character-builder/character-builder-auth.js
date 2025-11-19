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
            <input type="password" id="login-password" class="terminal-input" placeholder="••••••••" autocomplete="current-password" />
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
        
        <div id="login-loading" class="loading-indicator is-hidden">
          <div class="spinner">⣾⣽⣻⢿⡿⣟⣯⣷</div>
          <div class="loading-text">Authenticating...</div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitButton = document.getElementById('login-submit');
    const guestButton = document.getElementById('login-guest');
    const switchButton = document.getElementById('switch-to-register');
    const errorDiv = document.getElementById('login-error');
    const loadingDiv = document.getElementById('login-loading');

    // Handle submit
    const handleSubmit = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        this.showError(errorDiv, 'Please enter both email and password');
        return;
      }

      this.showLoading(loadingDiv, true);
      errorDiv.classList.add('is-hidden');

      try {
        const user = await AuthService.login(email, password);
        this.showLoading(loadingDiv, false);
        this.removeAuthScreen();
        if (onSuccess) onSuccess(user);
      } catch (error) {
        this.showLoading(loadingDiv, false);
        this.showError(errorDiv, error.message || 'Login failed. Please try again.');
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    
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
            <label class="form-label">[ USERNAME ]</label>
            <input type="text" id="register-username" class="terminal-input" placeholder="ChooseYourName" autocomplete="username" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <input type="password" id="register-password" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ CONFIRM PASSWORD ]</label>
            <input type="password" id="register-password-confirm" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
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
        
        <div id="register-loading" class="loading-indicator is-hidden">
          <div class="spinner">⣾⣽⣻⢿⡿⣟⣯⣷</div>
          <div class="loading-text">Creating account...</div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('register-email');
    const usernameInput = document.getElementById('register-username');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-password-confirm');
    const roleSelect = document.getElementById('register-role');
    const submitButton = document.getElementById('register-submit');
    const cancelButton = document.getElementById('register-cancel');
    const errorDiv = document.getElementById('register-error');
    const loadingDiv = document.getElementById('register-loading');

    // Handle submit
    const handleSubmit = async () => {
      const email = emailInput.value.trim();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;
      const role = roleSelect.value;

      if (!email || !username || !password || !confirmPassword) {
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

      this.showLoading(loadingDiv, true);
      errorDiv.classList.add('is-hidden');

      try {
        const user = await AuthService.register(email, username, password, role);
        this.showLoading(loadingDiv, false);
        this.removeAuthScreen();
        if (onSuccess) onSuccess(user);
      } catch (error) {
        this.showLoading(loadingDiv, false);
        this.showError(errorDiv, error.message || 'Registration failed. Please try again.');
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    
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

  // Helper: Show/hide loading
  showLoading(loadingDiv, show) {
    if (show) {
      loadingDiv.classList.remove('is-hidden');
      // Animate spinner
      const spinner = loadingDiv.querySelector('.spinner');
      if (spinner) {
        let frame = 0;
        const frames = spinner.textContent;
        spinner.dataset.interval = setInterval(() => {
          spinner.textContent = frames[frame % frames.length];
          frame++;
        }, 100);
      }
    } else {
      loadingDiv.classList.add('is-hidden');
      const spinner = loadingDiv.querySelector('.spinner');
      if (spinner && spinner.dataset.interval) {
        clearInterval(spinner.dataset.interval);
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
      statusText.innerHTML = `${roleIcon} ${user.username.toUpperCase()} | <button class="link-button" id="header-logout">LOGOUT</button>`;
      
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

