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
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ LOGIN ]';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ REGISTER ]';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('authError');

    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.login(username, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Logged in as ${username}`);
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Logged in as ${username}`, 'success');
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
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorEl = document.getElementById('authError');

    if (!username || !email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.register(username, email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Registered as ${username}`);
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Registered as ${username}`, 'success');
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
        },
    );
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');

    // In the integrated app, the builder surface no longer exposes login/logout
    // UI. If these elements are missing, simply skip any header updates.
    if (!authBtn || !userInfoDisplay) {
        return;
    }

    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userInfoDisplay.textContent = user ? `☁ ${user.username}` : '☁ Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;
    } else {
        userInfoDisplay.textContent = '▣ Local Only';
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
// INITIALIZATION
// ========================================

// Initialize auth UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthUI);
} else {
    updateAuthUI();
}

console.log('☁️ Character Builder Cloud Integration loaded');
