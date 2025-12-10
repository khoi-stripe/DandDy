// ========================================
// CHARACTER BUILDER - CLOUD INTEGRATION
// ========================================
// Handles authentication UI and cloud storage for Character Builder

// ========================================
// AUTHENTICATION UI HANDLERS
// ========================================

function showAuthModal() {
    document.getElementById('authModal').classList.add('show');
    showLoginForm();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authError').classList.add('is-hidden');
    // Clear form fields
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    if (registerPasswordConfirm) {
        registerPasswordConfirm.value = '';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = 'LOGIN';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = 'REGISTER';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

async function handleLogin() {
    const errorEl = document.getElementById('authError');

    // If the login form is hidden (user is on the REGISTER tab), do nothing.
    // This avoids showing "Please enter both email and password" errors on
    // the register screen if some stray event fires the login handler.
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl && loginFormEl.classList.contains('is-hidden')) {
        return;
    }

    // See note in character-manager.js: password managers / autofill can race
    // with our click handler. Wait briefly before reading values to avoid
    // false "Please enter both email and password" errors.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.login(email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Logged in as ${email}`);

            // Start session monitoring now that user is logged in
            if (typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Logged in as ${email}`, 'success');
            }
        } else {
            errorEl.textContent = result.error || 'Login failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    }
}

async function handleRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirmEl = document.getElementById('registerPasswordConfirm');
    const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';
    const errorEl = document.getElementById('authError');

    if (!email || !password || (passwordConfirmEl && !passwordConfirm)) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    if (passwordConfirmEl && password !== passwordConfirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.register(email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Registered as ${email}`);

            // Start session monitoring now that user is logged in
            if (typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Registered as ${email}`, 'success');
            }
        } else {
            errorEl.textContent = result.error || 'Registration failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Registration failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    }
}

function handleLogout() {
    if (!window.App || !window.App.showConfirmationOverlay) {
        // Fallback to immediate logout if confirmation UI is not available
        window.AuthService.logout();
        updateAuthUI();
        
        // Show login screen after logout
        if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
            window.AuthUI.showLogin(
                () => location.reload(),  // onSuccess
                () => {},                 // onSwitchToRegister (handled within AuthUI)
                () => {}                  // onGuestMode
            );
        }
        return;
    }

    window.App.showConfirmationOverlay(
        'Log out? Your character will be saved to the cloud before logging out.',
        async () => {
            // Save current character to cloud before logout if there is one
            if (window.CharacterState && window.CharacterState.current.character.name) {
                await saveCurrentCharacterToCloud();
            }

            window.AuthService.logout();
            updateAuthUI();
            console.log('✓ Logged out');

            if (window.App && window.App.showNotification) {
                window.App.showNotification('✓ Logged out', 'success');
            }
            
            // Show login screen after logout
            if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
                window.AuthUI.showLogin(
                    () => location.reload(),  // onSuccess
                    () => {},                 // onSwitchToRegister (handled within AuthUI)
                    () => {}                  // onGuestMode
                );
            }
        },
    );
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const userStatusIcon = document.getElementById('userStatusIcon');
    const userStatusText = document.getElementById('userStatusText');

    // In the integrated app, the builder surface no longer exposes login/logout
    // UI. If these elements are missing, simply skip any header updates.
    if (!authBtn || !userInfoDisplay || !userStatusIcon || !userStatusText) {
        return;
    }

    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userStatusIcon.textContent = '☁';
        userStatusText.textContent = user ? user.email : 'Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;
    } else {
        userStatusIcon.textContent = '▣';
        userStatusText.textContent = 'Local Only';
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = showAuthModal;
    }
}

// ========================================
// CLOUD STORAGE INTEGRATION
// ========================================

async function saveCurrentCharacterToCloud() {
    try {
        if (!window.AuthService || !window.AuthService.isAuthenticated()) {
            console.log('💾 Not logged in - character saved to localStorage only');
            return false;
        }

        if (!window.CharacterCloudStorage) {
            console.error('☁️ CharacterCloudStorage not available');
            return false;
        }

        const character = window.CharacterState.current.character;
        
        // Don't save if no name yet (character not complete)
        if (!character.name) {
            console.log('☁️ Character has no name yet - skipping cloud save');
            return false;
        }

        console.log('☁️ Saving character to cloud:', character.name);

        // Check if this character already exists in cloud (by characterUid)
        const allCloudChars = await window.CharacterCloudStorage.getAll();
        const existingChar = allCloudChars.find(c => 
            c.characterUid === character.characterUid ||
            c.metadata?.characterUid === character.characterUid
        );

        if (existingChar) {
            // Update existing
            console.log('☁️ Updating existing character in cloud:', existingChar.id);
            await window.CharacterCloudStorage.update(existingChar.id, character);
            console.log('☁️ Character updated in cloud successfully');
        } else {
            // Create new
            console.log('☁️ Creating new character in cloud');
            const result = await window.CharacterCloudStorage.add(character);
            console.log('☁️ Character created in cloud with ID:', result.id);
        }

        return true;
    } catch (error) {
        console.error('☁️ Failed to save character to cloud:', error);
        return false;
    }
}

// ========================================
// SESSION EXPIRED HANDLING
// ========================================

// Handle session expired events in the builder
function handleSessionExpired() {
    // Update the UI to reflect logged-out state
    updateAuthUI();

    // Show a confirmation overlay with options
    if (window.App && window.App.showConfirmationOverlay) {
        window.App.showConfirmationOverlay(
            'Your session has expired. Your character is safe locally, but you\'ll need to log in again to sync with the cloud.',
            () => {
                // User clicked RE-LOGIN
                showAuthModal();
            },
            'RE-LOGIN',
            'CONTINUE OFFLINE'
        );
    } else if (window.App && window.App.showNotification) {
        // Fallback: just show a notification
        window.App.showNotification('⚠ Session expired - log in again to sync', 'warning');
    }
}

// ========================================
// INITIALIZATION
// ========================================

// Initialize auth UI and session monitor when DOM is ready
function initBuilderAuth() {
    updateAuthUI();

    // Start session monitoring if authenticated
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        if (typeof window.AuthService.startSessionMonitor === 'function') {
            window.AuthService.startSessionMonitor();
        }
    }

    // Listen for session expired events
    window.addEventListener('danddy:sessionExpired', handleSessionExpired);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuilderAuth);
} else {
    initBuilderAuth();
}

console.log('☁️ Character Builder Cloud Integration loaded');
