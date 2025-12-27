/**
 * DandDy Admin Application
 * Handles authentication, navigation, and admin operations
 * 
 * NOTE: Admin uses SEPARATE session storage from the main app.
 * You can be logged into the app as one user and admin as another.
 */
(function (global) {
  'use strict';

  const cfg = global.DanddyConfig || {};
  const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const DEBUG = !!cfg.DEBUG;

  // Admin-specific storage keys (separate from main app)
  const ADMIN_TOKEN_KEY = 'dnd_admin_token';
  const ADMIN_USER_KEY = 'dnd_admin_user';

  // ========================================
  // ADMIN AUTH HELPERS (separate from main app)
  // ========================================
  const AdminAuth = {
    getToken() {
      return localStorage.getItem(ADMIN_TOKEN_KEY);
    },
    
    setToken(token) {
      if (token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
      }
    },
    
    getUser() {
      const raw = localStorage.getItem(ADMIN_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    
    setUser(user) {
      if (user) {
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      }
    },
    
    clear() {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
    },
    
    isAuthenticated() {
      return !!this.getToken();
    },
  };

  // ========================================
  // STATE
  // ========================================
  const state = {
    currentSection: 'dashboard',
    isAdmin: false,
    token: null,
    user: null,
    
    // Characters
    characters: [],
    filteredCharacters: [],
    selectedCharacterIds: new Set(),
    characterSortColumn: 'created_at',
    characterSortDirection: 'desc',
    usersMap: {},
    
    // Prompts
    promptEntries: [],
    filteredPromptEntries: [],
    editingPromptId: null,
    
    // Users
    users: [],
    filteredUsers: [],
    selectedUserIds: new Set(),
    
    // Dashboard stats
    stats: {
      users: 0,
      characters: 0,
      portraits: 0,
      prompts: 0,
    },
  };

  // ========================================
  // UTILITIES
  // ========================================
  function $(id) {
    return document.getElementById(id);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function log(...args) {
    if (DEBUG) console.log('[AdminApp]', ...args);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  function truncate(str, maxLen = 60) {
    if (!str || str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }

  // ========================================
  // API HELPERS
  // ========================================
  async function apiRequest(endpoint, options = {}) {
    const token = state.token || AdminAuth.getToken();
    if (!token) throw new Error('Not authenticated');

    const url = `${API_BASE}${endpoint}`;
    log('API request:', options.method || 'GET', url);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) {
          detail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch (_) {}
      
      if (response.status === 401) {
        handleLogout();
        throw new Error('Session expired. Please log in again.');
      }
      
      if (response.status === 403) {
        throw new Error('Admin access required.');
      }
      
      throw new Error(detail);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // ========================================
  // TOAST NOTIFICATIONS
  // ========================================
  function showToast(message, variant = 'primary', duration = 4000) {
    const alert = Object.assign(document.createElement('sl-alert'), {
      variant,
      closable: true,
      duration,
    });
    alert.innerHTML = `
      <sl-icon name="${getToastIcon(variant)}" slot="icon"></sl-icon>
      ${escapeHtml(message)}
    `;
    
    const container = $('toast-container');
    if (!container) {
      document.body.appendChild(alert);
    } else {
      container.appendChild(alert);
    }
    
    alert.toast();
  }

  function getToastIcon(variant) {
    switch (variant) {
      case 'success': return 'check-circle';
      case 'danger': return 'exclamation-octagon';
      case 'warning': return 'exclamation-triangle';
      default: return 'info-circle';
    }
  }

  // ========================================
  // AUTHENTICATION
  // ========================================
  async function checkAuth() {
    const token = AdminAuth.getToken();
    if (!token) {
      showLoginGate();
      return false;
    }

    try {
      // Fetch profile using admin token
      const profile = await fetchAdminProfile(token);
      if (!profile) {
        AdminAuth.clear();
        showLoginGate();
        return false;
      }

      // Check if user is admin (case-insensitive)
      if (profile.role?.toLowerCase() !== 'admin') {
        showToast('Admin access required. You do not have permission to access this area.', 'danger');
        AdminAuth.clear();
        showLoginGate();
        return false;
      }

      state.token = token;
      state.user = profile;
      state.isAdmin = true;
      
      $('user-email').textContent = profile.email || 'Admin';
      
      showAdminShell();
      return true;
    } catch (err) {
      log('Auth check failed:', err);
      AdminAuth.clear();
      showLoginGate();
      return false;
    }
  }

  // Fetch profile using admin-specific token
  async function fetchAdminProfile(token) {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }
        throw new Error('Failed to fetch profile');
      }

      return await response.json();
    } catch (err) {
      log('fetchAdminProfile error:', err);
      return null;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    
    const emailInput = $('login-email');
    const passwordInput = $('login-password');
    const loginBtn = $('login-btn');
    const errorAlert = $('login-error');
    const errorMessage = $('login-error-message');
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
      errorMessage.textContent = 'Please enter your username/email and password';
      errorAlert.open = true;
      return;
    }
    
    loginBtn.loading = true;
    errorAlert.open = false;
    
    try {
      // Login directly (not via AuthService to keep sessions separate)
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let detail = 'Login failed';
        try {
          const errJson = await response.json();
          if (errJson && errJson.detail) detail = errJson.detail;
        } catch (_) {}
        throw new Error(detail);
      }

      const data = await response.json();
      if (!data || !data.access_token) {
        throw new Error('Login succeeded but no token was returned.');
      }

      // Store in admin-specific storage
      AdminAuth.setToken(data.access_token);
      
      // Fetch and verify profile
      const profile = await fetchAdminProfile(data.access_token);
      if (!profile) {
        AdminAuth.clear();
        throw new Error('Failed to fetch user profile.');
      }
      
      // Verify admin role (case-insensitive)
      if (profile.role?.toLowerCase() !== 'admin') {
        AdminAuth.clear();
        throw new Error('Admin access required. Your account does not have admin privileges.');
      }
      
      AdminAuth.setUser(profile);
      state.token = data.access_token;
      state.user = profile;
      state.isAdmin = true;
      
      $('user-email').textContent = profile.email || 'Admin';
      
      showAdminShell();
      loadDashboardData();
      
    } catch (err) {
      log('Login error:', err);
      errorMessage.textContent = err.message || 'Login failed';
      errorAlert.open = true;
    } finally {
      loginBtn.loading = false;
    }
  }

  function handleLogout() {
    AdminAuth.clear();
    state.token = null;
    state.user = null;
    state.isAdmin = false;
    showLoginGate();
  }

  function showLoginGate() {
    $('login-gate').classList.remove('hidden');
    $('admin-shell').classList.add('hidden');
  }

  function showAdminShell() {
    $('login-gate').classList.add('hidden');
    $('admin-shell').classList.remove('hidden');
    navigateToSection('dashboard');
  }

  // ========================================
  // NAVIGATION
  // ========================================
  function navigateToSection(sectionId) {
    log('Navigating to:', sectionId);
    state.currentSection = sectionId;
    
    // Update nav items
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });
    
    // Update section visibility
    $$('.content-section').forEach(section => {
      section.classList.toggle('active', section.id === `section-${sectionId}`);
    });
    
    // Update header title
    const titles = {
      dashboard: 'Dashboard',
      characters: 'Character Management',
      prompts: 'Prompt Configuration',
      users: 'User Management',
      themes: 'Theme Management',
      settings: 'System Settings',
    };
    $('section-title').textContent = titles[sectionId] || 'Admin';
    
    // Load section data
    switch (sectionId) {
      case 'dashboard':
        loadDashboardData();
        break;
      case 'characters':
        loadCharacters();
        break;
      case 'prompts':
        loadPromptEntries();
        break;
      case 'users':
        loadUsers();
        break;
      case 'themes':
        loadThemeSettings();
        break;
      case 'settings':
        loadSettings();
        break;
    }
  }

  // ========================================
  // DASHBOARD
  // ========================================
  async function loadDashboardData() {
    try {
      // Load stats in parallel
      const [users, characters, prompts] = await Promise.all([
        apiRequest('/users/').catch(() => []),
        apiRequest('/characters/all').catch(() => []),
        apiRequest('/prompt-entries?include_archived=true').catch(() => []),
      ]);
      
      state.stats.users = users.length;
      state.stats.characters = characters.length;
      state.stats.prompts = prompts.length;
      
      // Count portraits (characters with portrait data)
      state.stats.portraits = characters.filter(c => c.portrait_url || c.ascii_portrait).length;
      
      // Update stat cards
      $('stat-users').textContent = state.stats.users.toLocaleString();
      $('stat-characters').textContent = state.stats.characters.toLocaleString();
      $('stat-portraits').textContent = state.stats.portraits.toLocaleString();
      $('stat-prompts').textContent = state.stats.prompts.toLocaleString();
      
      // Update API status
      $('backend-status').variant = 'success';
      $('backend-status').textContent = 'Online';
      $('api-status').variant = 'success';
      $('api-status').textContent = 'API Online';
      
      // Load recent activity
      renderRecentActivity(characters);
      
    } catch (err) {
      log('Dashboard load error:', err);
      $('backend-status').variant = 'danger';
      $('backend-status').textContent = 'Error';
    }
  }

  function renderRecentActivity(characters) {
    const container = $('recent-activity');
    
    // Get 10 most recent characters
    const recent = [...characters]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
    
    if (recent.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <sl-icon name="inbox"></sl-icon>
          <p>No recent activity</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = recent.map(char => `
      <div class="activity-item" style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--admin-border);">
        <sl-icon name="person-plus" style="color: var(--admin-accent);"></sl-icon>
        <div style="flex: 1;">
          <div style="font-weight: 500;">${escapeHtml(char.name || 'Unnamed')}</div>
          <div style="font-size: 11px; color: var(--admin-text-dim);">
            ${escapeHtml(char.race || '?')} ${escapeHtml(char.character_class || '?')} • ${formatDate(char.created_at)}
          </div>
        </div>
      </div>
    `).join('');
  }

  // ========================================
  // CHARACTERS
  // ========================================
  async function loadCharacters() {
    const tbody = $('characters-tbody');
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="8">
          <sl-spinner></sl-spinner>
          <span>Loading characters...</span>
        </td>
      </tr>
    `;
    
    try {
      // Load users map for email display
      const users = await apiRequest('/users/').catch(() => []);
      state.usersMap = {};
      users.forEach(u => { state.usersMap[u.id] = u; });
      
      // Update user filter dropdown
      const userFilter = $('char-user-filter');
      userFilter.innerHTML = '<sl-option value="">All Users</sl-option>' +
        users.map(u => `<sl-option value="${u.id}">${escapeHtml(u.email)}</sl-option>`).join('');
      
      // Load characters
      state.characters = await apiRequest('/characters/all');
      state.filteredCharacters = [...state.characters];
      state.selectedCharacterIds.clear();
      
      applyCharacterSort();
      renderCharactersTable();
      updateCharacterSelectionUI();
      
    } catch (err) {
      log('Characters load error:', err);
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="8" style="color: hsl(0, 100%, 50%);">
            Error loading characters: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function filterCharacters() {
    const search = ($('char-search').value || '').toLowerCase();
    const userFilter = $('char-user-filter').value;
    const demoFilter = $('char-demo-filter').value;
    
    state.filteredCharacters = state.characters.filter(c => {
      // User filter
      if (userFilter && String(c.user_id || c.owner_id) !== userFilter) return false;
      
      // Demo filter
      if (demoFilter === 'demo' && !c.is_demo) return false;
      if (demoFilter === 'non-demo' && c.is_demo) return false;
      
      // Search filter
      if (search) {
        const matchesQuery =
          (c.name || '').toLowerCase().includes(search) ||
          (c.race || '').toLowerCase().includes(search) ||
          (c.character_class || '').toLowerCase().includes(search) ||
          String(c.id).includes(search);
        if (!matchesQuery) return false;
      }
      
      return true;
    });
    
    applyCharacterSort();
    renderCharactersTable();
    updateCharacterSelectionUI();
  }

  function applyCharacterSort() {
    const col = state.characterSortColumn;
    const dir = state.characterSortDirection;
    
    state.filteredCharacters.sort((a, b) => {
      let aVal = a[col];
      let bVal = b[col];
      
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      
      if (col === 'level' || col === 'id') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else if (col === 'user_id') {
        // Sort by owner email, not numeric ID
        const aUser = state.usersMap[a.user_id || a.owner_id];
        const bUser = state.usersMap[b.user_id || b.owner_id];
        aVal = (aUser?.email || '').toLowerCase();
        bVal = (bUser?.email || '').toLowerCase();
      } else if (col === 'created_at') {
        aVal = new Date(aVal).getTime() || 0;
        bVal = new Date(bVal).getTime() || 0;
      } else if (col === 'is_demo') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }
      
      let result = 0;
      if (aVal < bVal) result = -1;
      if (aVal > bVal) result = 1;
      
      return dir === 'asc' ? result : -result;
    });
  }

  function sortCharactersBy(column) {
    if (state.characterSortColumn === column) {
      state.characterSortDirection = state.characterSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.characterSortColumn = column;
      state.characterSortDirection = 'asc';
    }
    
    // Update header indicators
    $$('#characters-table th.sortable').forEach(th => {
      th.classList.remove('active', 'asc', 'desc');
      if (th.dataset.sort === column) {
        th.classList.add('active', state.characterSortDirection);
      }
    });
    
    applyCharacterSort();
    renderCharactersTable();
  }

  function renderCharactersTable() {
    const tbody = $('characters-tbody');
    
    if (state.filteredCharacters.length === 0) {
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="8">No characters found</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = state.filteredCharacters.map(char => {
      const isSelected = state.selectedCharacterIds.has(char.id);
      const user = state.usersMap[char.user_id || char.owner_id];
      const userDisplay = user ? user.email : `User ${char.user_id || char.owner_id}`;
      
      return `
        <tr class="${isSelected ? 'selected' : ''}" data-id="${char.id}">
          <td class="checkbox-col">
            <sl-checkbox ${isSelected ? 'checked' : ''} data-char-id="${char.id}"></sl-checkbox>
          </td>
          <td><strong>${escapeHtml(char.name || 'Unnamed')}</strong></td>
          <td>${escapeHtml(char.race || '?')} ${escapeHtml(char.character_class || '?')}</td>
          <td>${char.level || 1}</td>
          <td>
            <span class="demo-badge ${char.is_demo ? 'active' : 'inactive'}" 
                  data-char-id="${char.id}" 
                  data-current="${char.is_demo ? 'true' : 'false'}">
              ${char.is_demo ? '✓ DEMO' : '—'}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--admin-text-dim);">${escapeHtml(userDisplay)}</td>
          <td style="font-size: 11px; color: var(--admin-text-dim);">${formatDate(char.created_at)}</td>
          <td>
            <div class="table-actions">
              <sl-button size="small" variant="danger" data-action="delete" data-char-id="${char.id}">
                <sl-icon name="trash"></sl-icon>
              </sl-button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function toggleCharacterSelection(charId, isSelected) {
    if (isSelected) {
      state.selectedCharacterIds.add(charId);
    } else {
      state.selectedCharacterIds.delete(charId);
    }
    
    // Update row styling
    const row = document.querySelector(`#characters-tbody tr[data-id="${charId}"]`);
    if (row) row.classList.toggle('selected', isSelected);
    
    updateCharacterSelectionUI();
  }

  function selectAllCharacters(selectAll) {
    state.selectedCharacterIds.clear();
    if (selectAll) {
      state.filteredCharacters.forEach(c => state.selectedCharacterIds.add(c.id));
    }
    renderCharactersTable();
    updateCharacterSelectionUI();
  }

  function updateCharacterSelectionUI() {
    const count = state.selectedCharacterIds.size;
    $('char-selected-count').textContent = count;
    $('char-delete-btn').disabled = count === 0;
    $('char-select-all').checked = count > 0 && count === state.filteredCharacters.length;
  }

  async function toggleCharacterDemo(charId, newDemoStatus) {
    try {
      await apiRequest(`/characters/${charId}/demo`, {
        method: 'PATCH',
        body: { is_demo: newDemoStatus },
      });
      
      // Update local state
      const char = state.characters.find(c => c.id === charId);
      if (char) char.is_demo = newDemoStatus;
      const filteredChar = state.filteredCharacters.find(c => c.id === charId);
      if (filteredChar) filteredChar.is_demo = newDemoStatus;
      
      renderCharactersTable();
      showToast(`Character ${newDemoStatus ? 'added to' : 'removed from'} demo mode`, 'success');
      
    } catch (err) {
      log('Toggle demo error:', err);
      showToast(`Failed to update demo status: ${err.message}`, 'danger');
    }
  }

  async function deleteSelectedCharacters() {
    const ids = [...state.selectedCharacterIds];
    if (ids.length === 0) return;
    
    const dialog = $('delete-dialog');
    $('delete-message').textContent = `Are you sure you want to delete ${ids.length} character(s)? This action cannot be undone.`;
    dialog.show();
    
    // Wait for confirmation
    return new Promise(resolve => {
      const confirmBtn = $('delete-confirm-btn');
      const cancelBtn = $('delete-cancel-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleConfirm = async () => {
        cleanup();
        dialog.hide();
        
        confirmBtn.loading = true;
        let deleted = 0;
        let failed = 0;
        
        for (const id of ids) {
          try {
            await apiRequest(`/characters/${id}`, { method: 'DELETE' });
            deleted++;
          } catch {
            failed++;
          }
        }
        
        confirmBtn.loading = false;
        
        if (failed > 0) {
          showToast(`Deleted: ${deleted}, Failed: ${failed}`, 'warning');
        } else {
          showToast(`Successfully deleted ${deleted} character(s)`, 'success');
        }
        
        loadCharacters();
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  // ========================================
  // PROMPT ENTRIES
  // ========================================
  async function loadPromptEntries() {
    // Ensure form visibility is correct for current user
    syncPromptFormVisibility();
    
    const tbody = $('prompts-tbody');
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="4">
          <sl-spinner></sl-spinner>
          <span>Loading entries...</span>
        </td>
      </tr>
    `;
    
    try {
      state.promptEntries = await apiRequest('/prompt-entries?include_archived=true');
      state.filteredPromptEntries = [...state.promptEntries];
      filterPromptEntries();
      renderPromptsTable();
      
    } catch (err) {
      log('Prompts load error:', err);
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="4" style="color: hsl(0, 100%, 50%);">
            Error loading entries: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function filterPromptEntries() {
    const kindFilter = $('prompt-kind-filter').value;
    const archiveFilter = $('prompt-archive-filter').value;
    const search = ($('prompt-search').value || '').toLowerCase();
    
    state.filteredPromptEntries = state.promptEntries.filter(e => {
      if (kindFilter && e.kind !== kindFilter) return false;
      
      if (archiveFilter === 'active' && e.is_archived) return false;
      if (archiveFilter === 'archived' && !e.is_archived) return false;
      
      if (search) {
        const matchesSearch =
          (e.key || '').toLowerCase().includes(search) ||
          (e.description || '').toLowerCase().includes(search) ||
          (e.style_description || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    renderPromptsTable();
  }

  function renderPromptsTable() {
    const tbody = $('prompts-tbody');
    
    if (state.filteredPromptEntries.length === 0) {
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="4">No entries found</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = state.filteredPromptEntries.map(entry => {
      const descText = entry.kind === 'style' 
        ? (entry.style_description || '') 
        : (entry.description || '');
      
      let badges = `<span class="kind-badge">${entry.kind}</span>`;
      if (entry.is_global) badges += ' <span class="kind-badge global">global</span>';
      if (entry.is_archived) badges += ' <span class="kind-badge archived">archived</span>';
      
      return `
        <tr data-id="${entry.id}" class="${entry.is_archived ? 'archived-row' : ''}" style="${entry.is_archived ? 'opacity: 0.5;' : ''}">
          <td>${badges}</td>
          <td>${escapeHtml(entry.key)}</td>
          <td title="${escapeHtml(descText)}">${escapeHtml(truncate(descText, 50))}</td>
          <td>
            <div class="table-actions">
              <sl-button size="small" data-action="edit" data-entry-id="${entry.id}">Edit</sl-button>
              ${entry.is_archived 
                ? `<sl-button size="small" data-action="unarchive" data-entry-id="${entry.id}">Restore</sl-button>`
                : `<sl-button size="small" data-action="archive" data-entry-id="${entry.id}">Archive</sl-button>`
              }
              <sl-button size="small" variant="danger" data-action="delete" data-entry-id="${entry.id}">
                <sl-icon name="trash"></sl-icon>
              </sl-button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function loadPromptEntryIntoForm(entry) {
    state.editingPromptId = entry.id;
    $('prompt-entry-id').value = entry.id;
    $('prompt-kind').value = entry.kind || 'race';
    $('prompt-key').value = entry.key || '';
    $('prompt-description').value = entry.description || '';
    $('prompt-style-description').value = entry.style_description || '';
    $('prompt-background-description').value = entry.background_description || '';
    $('prompt-is-global').checked = entry.is_global || false;
    $('prompt-form-title').textContent = 'Edit Entry';
    syncPromptFormVisibility();
  }

  function resetPromptForm() {
    state.editingPromptId = null;
    $('prompt-entry-id').value = '';
    $('prompt-kind').value = 'race';
    $('prompt-key').value = '';
    $('prompt-description').value = '';
    $('prompt-style-description').value = '';
    $('prompt-background-description').value = '';
    $('prompt-is-global').checked = false;
    $('prompt-form-title').textContent = 'New Entry';
    syncPromptFormVisibility();
  }

  function syncPromptFormVisibility() {
    const kind = $('prompt-kind').value;
    const isStyle = kind === 'style';
    
    $$('.style-field').forEach(el => {
      el.classList.toggle('hidden', !isStyle);
    });
    
    // Toggle description field visibility (hidden when style is selected)
    const descWrapper = $('prompt-description-wrapper');
    if (descWrapper) {
      descWrapper.classList.toggle('hidden', isStyle);
    }
    
    // Only admins can set global - use the wrapper div
    const globalWrapper = $('prompt-global-wrapper');
    if (globalWrapper) {
      globalWrapper.classList.toggle('hidden', !state.isAdmin);
    }
  }

  async function savePromptEntry(e) {
    e.preventDefault();
    
    const kind = $('prompt-kind').value;
    const key = $('prompt-key').value.trim();
    const description = $('prompt-description').value.trim();
    const styleDescription = $('prompt-style-description').value.trim();
    const backgroundDescription = $('prompt-background-description').value.trim();
    const isGlobal = $('prompt-is-global').checked && state.isAdmin;
    
    if (!key) {
      showToast('Key is required', 'danger');
      return;
    }
    
    const payload = {
      kind,
      key,
      description: kind === 'style' ? '' : description,
      style_description: kind === 'style' ? styleDescription : null,
      background_description: kind === 'style' ? backgroundDescription : null,
      is_global: isGlobal,
    };
    
    const saveBtn = $('prompt-save-btn');
    saveBtn.loading = true;
    
    try {
      if (state.editingPromptId) {
        await apiRequest(`/prompt-entries/${state.editingPromptId}`, {
          method: 'PUT',
          body: payload,
        });
        showToast('Entry updated', 'success');
      } else {
        await apiRequest('/prompt-entries', {
          method: 'POST',
          body: payload,
        });
        showToast('Entry created', 'success');
      }
      
      resetPromptForm();
      loadPromptEntries();
      
    } catch (err) {
      log('Save prompt error:', err);
      showToast(`Failed to save: ${err.message}`, 'danger');
    } finally {
      saveBtn.loading = false;
    }
  }

  async function archivePromptEntry(entryId, archive) {
    try {
      const entry = state.promptEntries.find(e => e.id === entryId);
      if (!entry) return;
      
      await apiRequest(`/prompt-entries/${entryId}`, {
        method: 'PUT',
        body: { ...entry, is_archived: archive },
      });
      
      showToast(archive ? 'Entry archived' : 'Entry restored', 'success');
      loadPromptEntries();
      
    } catch (err) {
      log('Archive prompt error:', err);
      showToast(`Failed to ${archive ? 'archive' : 'restore'}: ${err.message}`, 'danger');
    }
  }

  async function deletePromptEntry(entryId) {
    const dialog = $('delete-dialog');
    $('delete-message').textContent = 'Are you sure you want to permanently delete this entry?';
    dialog.show();
    
    return new Promise(resolve => {
      const confirmBtn = $('delete-confirm-btn');
      const cancelBtn = $('delete-cancel-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleConfirm = async () => {
        cleanup();
        dialog.hide();
        
        try {
          await apiRequest(`/prompt-entries/${entryId}`, { method: 'DELETE' });
          showToast('Entry deleted', 'success');
          
          if (state.editingPromptId === entryId) {
            resetPromptForm();
          }
          
          loadPromptEntries();
        } catch (err) {
          showToast(`Failed to delete: ${err.message}`, 'danger');
        }
        
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  async function loadDefaultPrompts() {
    if (!confirm('Load all default pose, camera, and scene entries? This will add many entries.')) {
      return;
    }
    
    showToast('Loading defaults... This may take a moment.', 'primary');
    
    // Default entries would be generated here (simplified for now)
    showToast('Default entries feature coming soon', 'warning');
  }

  async function exportPrompts() {
    if (state.promptEntries.length === 0) {
      showToast('No entries to export', 'warning');
      return;
    }
    
    const exportData = state.promptEntries.map(e => ({
      kind: e.kind,
      key: e.key,
      description: e.description || '',
      style_description: e.style_description || '',
      background_description: e.background_description || '',
    }));
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-entries-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${exportData.length} entries`, 'success');
  }

  async function importPrompts() {
    $('prompt-import-file').click();
  }

  async function handlePromptImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected an array');
      }
      
      const validKinds = ['race', 'class', 'pose', 'camera', 'scene', 'style'];
      const validEntries = imported.filter(e =>
        e && typeof e.key === 'string' && e.key.trim() && validKinds.includes(e.kind)
      );
      
      if (validEntries.length === 0) {
        showToast('No valid entries found in file', 'warning');
        return;
      }
      
      if (!confirm(`Import ${validEntries.length} entries?`)) {
        e.target.value = '';
        return;
      }
      
      // Bulk create
      await apiRequest('/prompt-entries/bulk', {
        method: 'POST',
        body: { entries: validEntries },
      });
      
      showToast(`Imported ${validEntries.length} entries`, 'success');
      loadPromptEntries();
      
    } catch (err) {
      log('Import error:', err);
      showToast(`Import failed: ${err.message}`, 'danger');
    } finally {
      e.target.value = '';
    }
  }

  async function clearAllPrompts() {
    if (!confirm('Delete ALL prompt entries? This cannot be undone.')) {
      return;
    }
    
    try {
      await apiRequest('/prompt-entries', { method: 'DELETE' });
      showToast('All entries deleted', 'success');
      loadPromptEntries();
    } catch (err) {
      showToast(`Failed to clear: ${err.message}`, 'danger');
    }
  }

  // ========================================
  // USERS
  // ========================================
  async function loadUsers() {
    const tbody = $('users-tbody');
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="6">
          <sl-spinner></sl-spinner>
          <span>Loading users...</span>
        </td>
      </tr>
    `;
    
    try {
      state.users = await apiRequest('/users/');
      state.filteredUsers = [...state.users];
      state.selectedUserIds.clear();
      
      // Get character counts per user
      const characters = await apiRequest('/characters/all').catch(() => []);
      const charCounts = {};
      characters.forEach(c => {
        const uid = c.user_id || c.owner_id;
        charCounts[uid] = (charCounts[uid] || 0) + 1;
      });
      
      state.users.forEach(u => {
        u.character_count = charCounts[u.id] || 0;
      });
      
      filterUsers();
      renderUsersTable();
      updateUserSelectionUI();
      
    } catch (err) {
      log('Users load error:', err);
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="6" style="color: hsl(0, 100%, 50%);">
            Error loading users: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function filterUsers() {
    const search = ($('user-search').value || '').toLowerCase();
    const roleFilter = $('user-role-filter').value;
    
    state.filteredUsers = state.users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      
      if (search) {
        const matchesSearch = (u.email || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    renderUsersTable();
    updateUserSelectionUI();
  }

  function renderUsersTable() {
    const tbody = $('users-tbody');
    
    if (state.filteredUsers.length === 0) {
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="6">No users found</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = state.filteredUsers.map(user => {
      const isCurrentUser = state.user && state.user.id === user.id;
      const isSelected = state.selectedUserIds.has(user.id);
      
      return `
        <tr data-id="${user.id}" class="${isSelected ? 'selected' : ''}">
          <td class="checkbox-col">
            <sl-checkbox ${isSelected ? 'checked' : ''} data-user-id="${user.id}" ${isCurrentUser ? 'disabled' : ''}></sl-checkbox>
          </td>
          <td>
            <strong>${escapeHtml(user.email)}</strong>
            ${isCurrentUser ? '<sl-badge variant="primary" pill>You</sl-badge>' : ''}
          </td>
          <td>
            <sl-badge variant="${user.role === 'admin' ? 'warning' : 'neutral'}" pill>
              ${user.role || 'player'}
            </sl-badge>
          </td>
          <td style="font-size: 11px; color: var(--admin-text-dim);">${formatDate(user.created_at)}</td>
          <td>${user.character_count || 0}</td>
          <td>
            <div class="table-actions">
              ${!isCurrentUser ? `
                <sl-dropdown>
                  <sl-button slot="trigger" size="small" caret>
                    Actions
                  </sl-button>
                  <sl-menu>
                    <sl-menu-item data-action="toggle-role" data-user-id="${user.id}" data-current-role="${user.role}">
                      <sl-icon slot="prefix" name="${user.role === 'admin' ? 'shield' : 'shield-check'}"></sl-icon>
                      ${user.role === 'admin' ? 'Demote to Player' : 'Make Admin'}
                    </sl-menu-item>
                    <sl-menu-item data-action="reset-password" data-user-id="${user.id}" data-user-email="${escapeHtml(user.email)}">
                      <sl-icon slot="prefix" name="key"></sl-icon>
                      Reset Password
                    </sl-menu-item>
                    <sl-menu-item data-action="reset-limits" data-user-id="${user.id}">
                      <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>
                      Reset Limits
                    </sl-menu-item>
                    <sl-divider></sl-divider>
                    <sl-menu-item data-action="delete-user" data-user-id="${user.id}" class="danger-item">
                      <sl-icon slot="prefix" name="trash"></sl-icon>
                      Delete User
                    </sl-menu-item>
                  </sl-menu>
                </sl-dropdown>
              ` : `
                <sl-badge variant="neutral" pill>Protected</sl-badge>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // User selection functions
  function toggleUserSelection(userId, isSelected) {
    if (isSelected) {
      state.selectedUserIds.add(userId);
    } else {
      state.selectedUserIds.delete(userId);
    }
    
    // Update row styling
    const row = document.querySelector(`#users-tbody tr[data-id="${userId}"]`);
    if (row) row.classList.toggle('selected', isSelected);
    
    updateUserSelectionUI();
  }

  function selectAllUsers(selectAll) {
    state.selectedUserIds.clear();
    if (selectAll) {
      // Don't select the current user
      state.filteredUsers.forEach(u => {
        if (!state.user || state.user.id !== u.id) {
          state.selectedUserIds.add(u.id);
        }
      });
    }
    renderUsersTable();
    updateUserSelectionUI();
  }

  function updateUserSelectionUI() {
    const count = state.selectedUserIds.size;
    $('user-selected-count').textContent = count;
    $('user-batch-btn').disabled = count === 0;
    
    const selectAllCheckbox = $('user-select-all');
    // Count selectable users (excluding current user)
    const selectableCount = state.filteredUsers.filter(u => !state.user || state.user.id !== u.id).length;
    selectAllCheckbox.checked = count > 0 && count === selectableCount;
    selectAllCheckbox.indeterminate = count > 0 && count < selectableCount;
  }

  async function toggleUserRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'player' : 'admin';
    
    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      
      showToast(`User ${newRole === 'admin' ? 'promoted to admin' : 'demoted to player'}`, 'success');
      loadUsers();
      
    } catch (err) {
      log('Toggle role error:', err);
      showToast(`Failed to update role: ${err.message}`, 'danger');
    }
  }

  // Generate a random secure password
  function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let password = '';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      password += chars[array[i] % chars.length];
    }
    return password;
  }

  // Reset password for a user
  async function resetUserPassword(userId, userEmail) {
    const dialog = $('reset-password-dialog');
    const passwordInput = $('new-password-input');
    const emailDisplay = $('reset-password-email');
    
    emailDisplay.textContent = userEmail;
    passwordInput.value = generateRandomPassword();
    dialog.show();
    
    return new Promise(resolve => {
      const confirmBtn = $('reset-password-confirm-btn');
      const cancelBtn = $('reset-password-cancel-btn');
      const generateBtn = $('generate-password-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        generateBtn.removeEventListener('click', handleGenerate);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleGenerate = () => {
        passwordInput.value = generateRandomPassword();
      };
      
      const handleConfirm = async () => {
        const newPassword = passwordInput.value.trim();
        if (!newPassword || newPassword.length < 6) {
          showToast('Password must be at least 6 characters', 'danger');
          return;
        }
        
        cleanup();
        confirmBtn.loading = true;
        
        try {
          await apiRequest(`/users/${userId}`, {
            method: 'PATCH',
            body: { password: newPassword },
          });
          
          dialog.hide();
          showToast(`Password reset for ${userEmail}. New password: ${newPassword}`, 'success', 10000);
          resolve(true);
        } catch (err) {
          log('Password reset error:', err);
          showToast(`Failed to reset password: ${err.message}`, 'danger');
          resolve(false);
        } finally {
          confirmBtn.loading = false;
        }
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      generateBtn.addEventListener('click', handleGenerate);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  // Delete a single user
  async function deleteUser(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;
    
    const dialog = $('delete-dialog');
    $('delete-message').textContent = `Are you sure you want to delete ${user.email}? This action cannot be undone and will also delete all their characters.`;
    dialog.show();
    
    return new Promise(resolve => {
      const confirmBtn = $('delete-confirm-btn');
      const cancelBtn = $('delete-cancel-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleConfirm = async () => {
        cleanup();
        dialog.hide();
        confirmBtn.loading = true;
        
        try {
          await apiRequest(`/users/${userId}`, { method: 'DELETE' });
          showToast(`User ${user.email} deleted`, 'success');
          loadUsers();
        } catch (err) {
          log('Delete user error:', err);
          showToast(`Failed to delete user: ${err.message}`, 'danger');
        } finally {
          confirmBtn.loading = false;
        }
        
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  // Reset limits (quotas) for a specific user
  async function resetUserLimits(userId) {
    const subjectKey = `user:${userId}`;
    
    try {
      // Reset both rate limits and quotas
      await apiRequest('/ai/admin/reset-rate-limits', {
        method: 'POST',
        body: { subject_key: subjectKey },
      });
      
      await apiRequest('/ai/admin/reset-quota', {
        method: 'POST',
        body: { quota_type: 'all', subject_key: subjectKey },
      });
      
      showToast(`Limits reset for user ${userId}`, 'success');
    } catch (err) {
      log('Reset limits error:', err);
      showToast(`Failed to reset limits: ${err.message}`, 'danger');
    }
  }

  // Batch delete selected users
  async function batchDeleteUsers() {
    const ids = [...state.selectedUserIds];
    if (ids.length === 0) return;
    
    const dialog = $('delete-dialog');
    $('delete-message').textContent = `Are you sure you want to delete ${ids.length} user(s)? This action cannot be undone and will also delete all their characters.`;
    dialog.show();
    
    return new Promise(resolve => {
      const confirmBtn = $('delete-confirm-btn');
      const cancelBtn = $('delete-cancel-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleConfirm = async () => {
        cleanup();
        dialog.hide();
        confirmBtn.loading = true;
        
        let deleted = 0;
        let failed = 0;
        
        for (const id of ids) {
          try {
            await apiRequest(`/users/${id}`, { method: 'DELETE' });
            deleted++;
          } catch {
            failed++;
          }
        }
        
        confirmBtn.loading = false;
        
        if (failed > 0) {
          showToast(`Deleted: ${deleted}, Failed: ${failed}`, 'warning');
        } else {
          showToast(`Successfully deleted ${deleted} user(s)`, 'success');
        }
        
        loadUsers();
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  // Batch reset limits for selected users
  async function batchResetLimits() {
    const ids = [...state.selectedUserIds];
    if (ids.length === 0) return;
    
    showToast(`Resetting limits for ${ids.length} user(s)...`, 'primary');
    
    let success = 0;
    let failed = 0;
    
    for (const id of ids) {
      try {
        const subjectKey = `user:${id}`;
        await apiRequest('/ai/admin/reset-rate-limits', {
          method: 'POST',
          body: { subject_key: subjectKey },
        });
        await apiRequest('/ai/admin/reset-quota', {
          method: 'POST',
          body: { quota_type: 'all', subject_key: subjectKey },
        });
        success++;
      } catch {
        failed++;
      }
    }
    
    if (failed > 0) {
      showToast(`Limits reset: ${success} succeeded, ${failed} failed`, 'warning');
    } else {
      showToast(`Successfully reset limits for ${success} user(s)`, 'success');
    }
  }

  // Batch update role for selected users
  async function batchUpdateRole(newRole) {
    const ids = [...state.selectedUserIds];
    if (ids.length === 0) return;
    
    const dialog = $('user-action-dialog');
    const actionBtn = $('user-action-confirm-btn');
    const action = newRole === 'admin' ? 'promote to Admin' : 'demote to Player';
    
    $('user-action-message').textContent = `Are you sure you want to ${action} ${ids.length} user(s)?`;
    actionBtn.variant = newRole === 'admin' ? 'primary' : 'default';
    dialog.show();
    
    return new Promise(resolve => {
      const confirmBtn = $('user-action-confirm-btn');
      const cancelBtn = $('user-action-cancel-btn');
      
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('sl-hide', handleCancel);
      };
      
      const handleConfirm = async () => {
        cleanup();
        dialog.hide();
        confirmBtn.loading = true;
        
        let success = 0;
        let failed = 0;
        
        for (const id of ids) {
          try {
            await apiRequest(`/users/${id}`, {
              method: 'PATCH',
              body: { role: newRole },
            });
            success++;
          } catch {
            failed++;
          }
        }
        
        confirmBtn.loading = false;
        
        if (failed > 0) {
          showToast(`Role update: ${success} succeeded, ${failed} failed`, 'warning');
        } else {
          showToast(`Successfully updated ${success} user(s) to ${newRole}`, 'success');
        }
        
        loadUsers();
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        dialog.hide();
        resolve(false);
      };
      
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('sl-hide', handleCancel);
    });
  }

  // ========================================
  // THEME MANAGEMENT
  // ========================================
  
  const THEME_CONFIG_KEY = 'danddy_theme_config';
  
  // Default theme configuration
  const DEFAULT_THEME_CONFIG = {
    global: 'yellow',
    syncAll: true,
    sections: {
      terminal: null,  // null = use global - base UI (header, buttons, inputs)
      narrator: null,  // character builder left panel
      sheet: null,     // character sheet
      grid: null,      // character grid cards
      campaign: null,  // campaign sidebar
      modal: null,     // modal dialogs
      glow: null,      // background radial gradient only
    },
  };
  
  // Available themes with their HSL values for preview
  const AVAILABLE_THEMES = {
    green: { h: 120, s: '100%', l: '50%', name: 'Green', desc: 'Terminal' },
    teal: { h: 181, s: '100%', l: '41%', name: 'Teal', desc: 'Cyan' },
    yellow: { h: 48, s: '100%', l: '64%', name: 'Yellow', desc: 'Gold' },
    orange: { h: 25, s: '100%', l: '55%', name: 'Orange', desc: 'Warm' },
    red: { h: 0, s: '100%', l: '55%', name: 'Red', desc: 'Bold' },
    pink: { h: 330, s: '85%', l: '65%', name: 'Pink', desc: 'Campaign' },
    violet: { h: 270, s: '80%', l: '65%', name: 'Violet', desc: 'Purple' },
    blue: { h: 225, s: '100%', l: '60%', name: 'Blue', desc: 'Royal' },
    white: { h: 0, s: '0%', l: '90%', name: 'White', desc: 'Neutral' },
  };
  
  // Cache for server-loaded config
  let cachedServerConfig = null;
  
  async function loadThemeSettings() {
    log('Loading theme settings');
    
    // Try to load from server first
    const config = await getThemeConfigFromServer();
    
    // Apply to UI
    applyThemeConfigToUI(config);
  }
  
  function applyThemeConfigToUI(config) {
    // Set global theme select
    const globalSelect = $('global-theme-select');
    if (globalSelect) {
      globalSelect.value = config.global || 'yellow';
    }
    
    // Set sync checkbox
    const syncCheckbox = $('global-theme-sync');
    if (syncCheckbox) {
      syncCheckbox.checked = config.syncAll !== false;
    }
    
    // Set section selects
    const sections = ['terminal', 'narrator', 'sheet', 'grid', 'campaign', 'modal', 'glow'];
    sections.forEach(section => {
      const select = $(`theme-${section}`);
      if (select) {
        select.value = config.sections?.[section] || '';
        select.disabled = config.syncAll !== false;
      }
    });
    
    // Update override count badge
    updateOverrideCount();
    
    // Update preview
    updateThemePreview();
    
    // Update swatch selection
    updateSwatchSelection(config.global);
  }
  
  async function getThemeConfigFromServer() {
    try {
      // Fetch from server (public endpoint, no auth required)
      const response = await fetch(`${API_BASE}/config/themes`);
      
      if (response.ok) {
        const serverConfig = await response.json();
        
        // Convert server format to local format
        const config = {
          global: serverConfig.globalTheme || 'yellow',
          syncAll: serverConfig.syncAllSections !== false,
          sections: {
            terminal: serverConfig.sections?.terminal === 'global' ? null : serverConfig.sections?.terminal,
            narrator: serverConfig.sections?.narrator === 'global' ? null : serverConfig.sections?.narrator,
            sheet: serverConfig.sections?.sheet === 'global' ? null : serverConfig.sections?.sheet,
            grid: serverConfig.sections?.grid === 'global' ? null : serverConfig.sections?.grid,
            campaign: serverConfig.sections?.campaign === 'global' ? null : serverConfig.sections?.campaign,
            modal: serverConfig.sections?.modal === 'global' ? null : serverConfig.sections?.modal,
            glow: serverConfig.sections?.glow === 'global' ? null : serverConfig.sections?.glow,
          },
        };
        
        // Cache it
        cachedServerConfig = config;
        
        // Also save to localStorage for cross-tab sync and offline use
        localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
        
        log('Theme config loaded from server:', config);
        return config;
      }
    } catch (err) {
      log('Error fetching theme config from server, falling back to localStorage:', err);
    }
    
    // Fallback to localStorage
    return getThemeConfigFromStorage();
  }
  
  function getThemeConfigFromStorage() {
    try {
      const stored = localStorage.getItem(THEME_CONFIG_KEY);
      if (stored) {
        return { ...DEFAULT_THEME_CONFIG, ...JSON.parse(stored) };
      }
    } catch (err) {
      log('Error loading theme config from storage:', err);
    }
    return { ...DEFAULT_THEME_CONFIG };
  }
  
  function getThemeConfig() {
    // Use cached server config if available, otherwise localStorage
    if (cachedServerConfig) {
      return cachedServerConfig;
    }
    return getThemeConfigFromStorage();
  }
  
  async function saveThemeConfigToServer(config) {
    try {
      // Convert local format to server format
      const serverPayload = {
        globalTheme: config.global,
        syncAllSections: config.syncAll,
        sections: {
          terminal: config.sections?.terminal || 'global',
          narrator: config.sections?.narrator || 'global',
          sheet: config.sections?.sheet || 'global',
          grid: config.sections?.grid || 'global',
          campaign: config.sections?.campaign || 'global',
          modal: config.sections?.modal || 'global',
          glow: config.sections?.glow || 'global',
        },
      };
      
      const response = await apiRequest('/config/themes', {
        method: 'PUT',
        body: serverPayload,
      });
      
      log('Theme config saved to server:', response);
      
      // Update cache
      cachedServerConfig = config;
      
      return true;
    } catch (err) {
      log('Error saving theme config to server:', err);
      return false;
    }
  }
  
  function saveThemeConfigToStorage(config) {
    try {
      localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
      log('Theme config saved to localStorage:', config);
      return true;
    } catch (err) {
      log('Error saving theme config to localStorage:', err);
      return false;
    }
  }
  
  function updateOverrideCount() {
    const config = getThemeConfig();
    let count = 0;
    
    if (!config.syncAll && config.sections) {
      Object.values(config.sections).forEach(val => {
        if (val) count++;
      });
    }
    
    const badge = $('section-override-count');
    if (badge) {
      badge.textContent = `${count} override${count !== 1 ? 's' : ''}`;
      badge.variant = count > 0 ? 'primary' : 'neutral';
    }
  }
  
  function updateSwatchSelection(selectedTheme) {
    $$('.theme-swatch').forEach(swatch => {
      swatch.classList.toggle('selected', swatch.dataset.theme === selectedTheme);
    });
  }
  
  function updateThemePreview() {
    const config = getThemeConfig();
    const previewBox = $('theme-preview-box');
    if (!previewBox) return;
    
    // Get effective themes for each section
    const globalTheme = config.global || 'yellow';
    const terminalTheme = config.syncAll ? globalTheme : (config.sections?.terminal || globalTheme);
    const gridTheme = config.syncAll ? globalTheme : (config.sections?.grid || globalTheme);
    const sheetTheme = config.syncAll ? globalTheme : (config.sections?.sheet || globalTheme);
    const campaignTheme = config.syncAll ? globalTheme : (config.sections?.campaign || globalTheme);
    const glowTheme = config.syncAll ? globalTheme : (config.sections?.glow || globalTheme);
    
    // Update preview colors
    const previewHeader = previewBox.querySelector('.preview-header');
    const gridArea = previewBox.querySelector('.preview-grid-area');
    const sheetArea = previewBox.querySelector('.preview-sheet-area');
    const campaignArea = previewBox.querySelector('.preview-campaign-area');
    const glowArea = previewBox.querySelector('.preview-glow');
    
    // Update header with terminal theme
    if (previewHeader) {
      const t = AVAILABLE_THEMES[terminalTheme];
      previewHeader.style.setProperty('--preview-h', t.h);
      previewHeader.style.setProperty('--preview-s', t.s);
      previewHeader.style.setProperty('--preview-l', t.l);
      previewHeader.style.color = `hsl(${t.h}, ${t.s}, ${t.l})`;
      previewHeader.style.borderBottomColor = `hsl(${t.h}, ${t.s}, ${t.l})`;
    }
    
    if (gridArea) {
      const t = AVAILABLE_THEMES[gridTheme];
      gridArea.style.setProperty('--preview-h', t.h);
      gridArea.style.setProperty('--preview-s', t.s);
      gridArea.style.setProperty('--preview-l', t.l);
    }
    
    if (sheetArea) {
      const t = AVAILABLE_THEMES[sheetTheme];
      sheetArea.style.setProperty('--preview-h', t.h);
      sheetArea.style.setProperty('--preview-s', t.s);
      sheetArea.style.setProperty('--preview-l', t.l);
    }
    
    if (campaignArea) {
      const t = AVAILABLE_THEMES[campaignTheme];
      campaignArea.style.setProperty('--preview-h', t.h);
      campaignArea.style.setProperty('--preview-s', t.s);
      campaignArea.style.setProperty('--preview-l', t.l);
    }
    
    if (glowArea) {
      const t = AVAILABLE_THEMES[glowTheme];
      glowArea.style.setProperty('--glow-h', t.h);
      glowArea.style.setProperty('--glow-s', t.s);
      glowArea.style.setProperty('--glow-l', t.l);
    }
  }
  
  function handleGlobalThemeChange(e) {
    const config = getThemeConfig();
    config.global = e.target.value;
    
    // Save to localStorage immediately for live preview (but not to server)
    saveThemeConfigToStorage(config);
    cachedServerConfig = config;
    
    updateSwatchSelection(config.global);
    updateThemePreview();
    
    // Broadcast for cross-tab live preview
    window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
  }
  
  function handleSyncToggle(e) {
    const config = getThemeConfig();
    config.syncAll = e.target.checked;
    
    // Save to localStorage immediately for live preview
    saveThemeConfigToStorage(config);
    cachedServerConfig = config;
    
    // Enable/disable section selects
    const sections = ['terminal', 'narrator', 'sheet', 'grid', 'campaign', 'modal', 'glow'];
    sections.forEach(section => {
      const select = $(`theme-${section}`);
      if (select) {
        select.disabled = config.syncAll;
      }
    });
    
    updateOverrideCount();
    updateThemePreview();
    
    // Broadcast for cross-tab live preview
    window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
  }
  
  function handleSectionThemeChange(section, value) {
    const config = getThemeConfig();
    if (!config.sections) config.sections = {};
    config.sections[section] = value || null;
    
    // Save to localStorage immediately for live preview
    saveThemeConfigToStorage(config);
    cachedServerConfig = config;
    
    updateOverrideCount();
    updateThemePreview();
    
    // Broadcast for cross-tab live preview
    window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
  }
  
  function handleSwatchClick(theme) {
    const globalSelect = $('global-theme-select');
    if (globalSelect) {
      globalSelect.value = theme;
      // Trigger change event
      globalSelect.dispatchEvent(new Event('sl-change'));
    }
  }
  
  async function saveThemeSettings() {
    const globalSelect = $('global-theme-select');
    const syncCheckbox = $('global-theme-sync');
    const saveBtn = $('theme-save-btn');
    
    const config = {
      global: globalSelect?.value || 'yellow',
      syncAll: syncCheckbox?.checked !== false,
      sections: {},
    };
    
    const sections = ['terminal', 'narrator', 'sheet', 'grid', 'campaign', 'modal', 'glow'];
    sections.forEach(section => {
      const select = $(`theme-${section}`);
      config.sections[section] = select?.value || null;
    });
    
    if (saveBtn) saveBtn.loading = true;
    
    // Save to server first (requires admin auth)
    const serverSaved = await saveThemeConfigToServer(config);
    
    // Always save to localStorage for cross-tab sync
    saveThemeConfigToStorage(config);
    
    if (saveBtn) saveBtn.loading = false;
    
    if (serverSaved) {
      showToast('Theme settings saved to server', 'success');
    } else {
      showToast('Theme settings saved locally (server save failed - check admin permissions)', 'warning');
    }
    
    // Dispatch event for other parts of the app to pick up
    window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
  }
  
  async function resetThemeSettings() {
    if (!confirm('Reset all theme settings to defaults?')) return;
    
    const resetBtn = $('theme-reset-btn');
    if (resetBtn) resetBtn.loading = true;
    
    // Save defaults to server
    const serverSaved = await saveThemeConfigToServer(DEFAULT_THEME_CONFIG);
    
    // Always save to localStorage
    saveThemeConfigToStorage(DEFAULT_THEME_CONFIG);
    
    // Update cache
    cachedServerConfig = { ...DEFAULT_THEME_CONFIG };
    
    // Reload UI
    applyThemeConfigToUI(DEFAULT_THEME_CONFIG);
    
    if (resetBtn) resetBtn.loading = false;
    
    if (serverSaved) {
      showToast('Theme settings reset to defaults (saved to server)', 'success');
    } else {
      showToast('Theme settings reset to defaults (local only)', 'warning');
    }
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: DEFAULT_THEME_CONFIG }));
  }
  
  function exportThemeConfig() {
    const config = getThemeConfig();
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `danddy-theme-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Theme configuration exported', 'success');
  }
  
  function importThemeConfig() {
    $('theme-import-file').click();
  }
  
  function handleThemeImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        
        // Validate structure
        if (typeof imported.global !== 'string' || !AVAILABLE_THEMES[imported.global]) {
          throw new Error('Invalid global theme');
        }
        
        const config = {
          global: imported.global,
          syncAll: imported.syncAll !== false,
          sections: {},
        };
        
        if (imported.sections && typeof imported.sections === 'object') {
          const sections = ['terminal', 'narrator', 'sheet', 'grid', 'campaign', 'modal', 'glow'];
          sections.forEach(section => {
            const val = imported.sections[section];
            if (val && AVAILABLE_THEMES[val]) {
              config.sections[section] = val;
            }
          });
        }
        
        saveThemeConfig(config);
        loadThemeSettings();
        showToast('Theme configuration imported', 'success');
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
        
      } catch (err) {
        log('Theme import error:', err);
        showToast(`Import failed: ${err.message}`, 'danger');
      }
    };
    
    reader.readAsText(file);
    e.target.value = '';
  }

  // ========================================
  // SETTINGS
  // ========================================
  
  // Feature flag storage keys
  const FEATURE_FLAGS_KEY = 'danddy_admin_feature_flags';
  
  function loadSettings() {
    // Settings are typically stored on the backend or in env vars
    // For now, just display placeholder values
    log('Settings section loaded');
    
    // Load feature flags from localStorage
    loadFeatureFlags();
    
    // Load quota stats
    loadQuotaStats();
  }
  
  function loadFeatureFlags() {
    try {
      const flags = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
      
      // Spell lookup flag
      const spellLookupSwitch = $('setting-spell-lookup');
      if (spellLookupSwitch) {
        spellLookupSwitch.checked = !!flags.spellLookup;
        // Apply to window immediately
        window.FEATURE_SPELL_LOOKUP = !!flags.spellLookup;
      }
      
      log('Feature flags loaded:', flags);
    } catch (err) {
      log('Error loading feature flags:', err);
    }
  }
  
  function saveFeatureFlags() {
    try {
      const flags = {
        spellLookup: $('setting-spell-lookup')?.checked || false,
      };
      
      localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
      
      // Apply spell lookup flag immediately
      window.FEATURE_SPELL_LOOKUP = flags.spellLookup;
      
      log('Feature flags saved:', flags);
      showToast('Feature flags saved', 'success');
    } catch (err) {
      log('Error saving feature flags:', err);
      showToast('Failed to save feature flags', 'danger');
    }
  }

  async function saveSettings() {
    // Save feature flags
    saveFeatureFlags();
    
    // Other settings would go here when backend support is added
  }

  // ========================================
  // QUOTA & RATE LIMIT MANAGEMENT
  // ========================================
  async function loadQuotaStats() {
    const rateLimitCountEl = $('rate-limit-count');
    const cooldownCountEl = $('cooldown-count');
    const prodStatusEl = $('quota-prod-status');
    const errorMsgEl = $('quota-error-msg');
    
    // Clear any previous error
    if (errorMsgEl) {
      errorMsgEl.classList.add('hidden');
      errorMsgEl.textContent = '';
    }
    
    try {
      // Try to get rate limit stats from admin endpoint
      const rateLimitStats = await apiRequest('/ai/admin/rate-limit-stats');
      
      if (rateLimitStats) {
        // Update production status
        if (rateLimitStats.production_mode) {
          prodStatusEl.variant = 'success';
          prodStatusEl.textContent = 'Production (Enforced)';
        } else {
          prodStatusEl.variant = 'warning';
          prodStatusEl.textContent = 'Development (Bypassed)';
        }
        
        // Update in-memory counts
        rateLimitCountEl.textContent = rateLimitStats.rate_limit_entries ?? '--';
        cooldownCountEl.textContent = rateLimitStats.character_cooldown_entries ?? '--';
      }
      
    } catch (err) {
      log('Rate limit stats error, trying fallback:', err);
      
      // Fallback: Try the quota/debug endpoint which already exists
      try {
        const debugInfo = await apiRequest('/ai/quota/debug');
        
        if (debugInfo && debugInfo.debug_info) {
          // Update production status
          if (debugInfo.debug_info.production_mode) {
            prodStatusEl.variant = 'success';
            prodStatusEl.textContent = 'Production (Enforced)';
          } else {
            prodStatusEl.variant = 'warning';
            prodStatusEl.textContent = 'Development (Bypassed)';
          }
          
          // We don't have rate limit counts from this endpoint
          rateLimitCountEl.textContent = '(stats endpoint not deployed)';
          cooldownCountEl.textContent = '(stats endpoint not deployed)';
          
          // Show info message
          if (errorMsgEl) {
            errorMsgEl.textContent = 'New rate limit stats endpoint not deployed yet. Using fallback. Quota reset still works.';
            errorMsgEl.classList.remove('hidden');
          }
        }
      } catch (fallbackErr) {
        log('Fallback quota stats also failed:', fallbackErr);
        
        prodStatusEl.variant = 'danger';
        prodStatusEl.textContent = 'Error';
        rateLimitCountEl.textContent = '--';
        cooldownCountEl.textContent = '--';
        
        // Show error message
        if (errorMsgEl) {
          errorMsgEl.textContent = `Error: ${fallbackErr.message || err.message || 'Failed to load stats'}`;
          errorMsgEl.classList.remove('hidden');
        }
      }
    }
  }

  async function resetRateLimits() {
    const subjectKey = $('quota-reset-subject').value.trim() || null;
    const resetBtn = $('rate-limit-reset-btn');
    
    const targetDesc = subjectKey ? `"${subjectKey}"` : 'ALL subjects';
    
    if (!confirm(`Clear rate limits for ${targetDesc}?\n\nThis resets per-minute throttling and character cooldowns.`)) {
      return;
    }
    
    resetBtn.loading = true;
    
    try {
      const payload = {};
      if (subjectKey) {
        payload.subject_key = subjectKey;
      }
      
      const result = await apiRequest('/ai/admin/reset-rate-limits', {
        method: 'POST',
        body: payload,
      });
      
      if (result && result.success) {
        showToast(`Cleared ${result.cleared} rate limit entry(ies)`, 'success');
        loadQuotaStats();
      } else {
        showToast('Rate limit reset returned unexpected result', 'warning');
      }
      
    } catch (err) {
      log('Rate limit reset error:', err);
      
      // Check if endpoint isn't deployed yet
      const isNotFound = err.message?.includes('404') || err.message?.includes('Not Found');
      if (isNotFound) {
        showToast('Rate limit reset endpoint not deployed yet. Please deploy backend first.', 'warning');
      } else {
        showToast(`Failed to reset rate limits: ${err.message}`, 'danger');
      }
    } finally {
      resetBtn.loading = false;
    }
  }

  async function resetQuotas(quotaType, buttonEl) {
    const subjectKey = $('quota-reset-subject').value.trim() || null;
    
    const targetDesc = subjectKey ? `"${subjectKey}"` : 'ALL subjects';
    const typeDesc = quotaType === 'all' ? 'ALL quotas' : (quotaType === 'images' ? 'image quotas' : 'character creation quotas');
    
    if (!confirm(`Reset ${typeDesc} for ${targetDesc} (today only)?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    if (buttonEl) buttonEl.loading = true;
    
    try {
      const payload = {
        quota_type: quotaType,
      };
      
      if (subjectKey) {
        payload.subject_key = subjectKey;
      }
      
      const result = await apiRequest('/ai/admin/reset-quota', {
        method: 'POST',
        body: payload,
      });
      
      if (result && result.success) {
        const deletedImages = result.deleted?.images || 0;
        const deletedChars = result.deleted?.characters || 0;
        
        let msg = 'Reset complete: ';
        if (quotaType === 'images') {
          msg += `${deletedImages} image quota(s) cleared`;
        } else if (quotaType === 'characters') {
          msg += `${deletedChars} character quota(s) cleared`;
        } else {
          msg += `${deletedImages} image + ${deletedChars} character quota(s) cleared`;
        }
        
        showToast(msg, 'success');
        loadQuotaStats();
      } else {
        showToast('Quota reset returned unexpected result', 'warning');
      }
      
    } catch (err) {
      log('Quota reset error:', err);
      showToast(`Failed to reset quotas: ${err.message}`, 'danger');
    } finally {
      if (buttonEl) buttonEl.loading = false;
    }
  }

  // ========================================
  // EVENT LISTENERS
  // ========================================
  function setupEventListeners() {
    // Login form
    $('login-form').addEventListener('submit', handleLogin);
    
    // Logout
    $('logout-btn').addEventListener('click', handleLogout);
    
    // Navigation
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        navigateToSection(item.dataset.section);
      });
    });
    
    // Characters
    $('char-search').addEventListener('sl-input', filterCharacters);
    $('char-user-filter').addEventListener('sl-change', filterCharacters);
    $('char-demo-filter').addEventListener('sl-change', filterCharacters);
    $('char-refresh-btn').addEventListener('click', loadCharacters);
    $('char-delete-btn').addEventListener('click', deleteSelectedCharacters);
    $('char-select-all').addEventListener('sl-change', (e) => {
      selectAllCharacters(e.target.checked);
    });
    
    // Characters table events (delegation)
    $('characters-tbody').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action], [data-char-id]');
      if (!target) return;
      
      const action = target.dataset.action;
      const charId = parseInt(target.dataset.charId, 10);
      
      if (action === 'delete' && charId) {
        state.selectedCharacterIds.clear();
        state.selectedCharacterIds.add(charId);
        deleteSelectedCharacters();
      } else if (target.classList.contains('demo-badge') && charId) {
        const currentDemo = target.dataset.current === 'true';
        toggleCharacterDemo(charId, !currentDemo);
      }
    });
    
    $('characters-tbody').addEventListener('sl-change', (e) => {
      const checkbox = e.target.closest('sl-checkbox[data-char-id]');
      if (checkbox) {
        const charId = parseInt(checkbox.dataset.charId, 10);
        toggleCharacterSelection(charId, checkbox.checked);
      }
    });
    
    // Character table sorting
    $$('#characters-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        sortCharactersBy(th.dataset.sort);
      });
    });
    
    // Prompts
    $('prompt-kind-filter').addEventListener('sl-change', filterPromptEntries);
    $('prompt-archive-filter').addEventListener('sl-change', filterPromptEntries);
    $('prompt-search').addEventListener('sl-input', filterPromptEntries);
    $('prompt-form').addEventListener('submit', savePromptEntry);
    $('prompt-reset-btn').addEventListener('click', resetPromptForm);
    $('prompt-kind').addEventListener('sl-change', syncPromptFormVisibility);
    $('prompt-load-defaults').addEventListener('click', loadDefaultPrompts);
    $('prompt-export').addEventListener('click', exportPrompts);
    $('prompt-import').addEventListener('click', importPrompts);
    $('prompt-import-file').addEventListener('change', handlePromptImport);
    $('prompt-clear-all').addEventListener('click', clearAllPrompts);
    
    // Prompts table events (delegation)
    $('prompts-tbody').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      
      const action = target.dataset.action;
      const entryId = parseInt(target.dataset.entryId, 10);
      
      if (action === 'edit') {
        const entry = state.promptEntries.find(e => e.id === entryId);
        if (entry) loadPromptEntryIntoForm(entry);
      } else if (action === 'archive') {
        archivePromptEntry(entryId, true);
      } else if (action === 'unarchive') {
        archivePromptEntry(entryId, false);
      } else if (action === 'delete') {
        deletePromptEntry(entryId);
      }
    });
    
    // Users
    $('user-search').addEventListener('sl-input', filterUsers);
    $('user-role-filter').addEventListener('sl-change', filterUsers);
    $('user-refresh-btn').addEventListener('click', loadUsers);
    $('user-select-all').addEventListener('sl-change', (e) => {
      selectAllUsers(e.target.checked);
    });
    
    // Users table events (delegation) - handle checkboxes
    $('users-tbody').addEventListener('sl-change', (e) => {
      const checkbox = e.target.closest('sl-checkbox[data-user-id]');
      if (checkbox) {
        const userId = parseInt(checkbox.dataset.userId, 10);
        toggleUserSelection(userId, checkbox.checked);
      }
    });
    
    // Users table events (delegation) - handle action menu items
    $('users-tbody').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      
      const action = target.dataset.action;
      const userId = parseInt(target.dataset.userId, 10);
      
      if (action === 'toggle-role') {
        const currentRole = target.dataset.currentRole;
        toggleUserRole(userId, currentRole);
      } else if (action === 'reset-password') {
        const userEmail = target.dataset.userEmail;
        resetUserPassword(userId, userEmail);
      } else if (action === 'delete-user') {
        deleteUser(userId);
      } else if (action === 'reset-limits') {
        resetUserLimits(userId);
      }
    });
    
    // Batch actions for users
    $('batch-delete-users').addEventListener('click', batchDeleteUsers);
    $('batch-reset-limits').addEventListener('click', batchResetLimits);
    $('batch-make-admin').addEventListener('click', () => batchUpdateRole('admin'));
    $('batch-demote').addEventListener('click', () => batchUpdateRole('player'));
    
    // Themes
    $('global-theme-select')?.addEventListener('sl-change', handleGlobalThemeChange);
    $('global-theme-sync')?.addEventListener('sl-change', handleSyncToggle);
    
    // Section theme selects
    const sectionSelects = ['terminal', 'narrator', 'sheet', 'grid', 'campaign', 'modal', 'glow'];
    sectionSelects.forEach(section => {
      const select = $(`theme-${section}`);
      if (select) {
        select.addEventListener('sl-change', (e) => handleSectionThemeChange(section, e.target.value));
      }
    });
    
    // Theme swatches
    $$('.theme-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => handleSwatchClick(swatch.dataset.theme));
    });
    
    // Theme actions
    $('theme-save-btn')?.addEventListener('click', saveThemeSettings);
    $('theme-reset-btn')?.addEventListener('click', resetThemeSettings);
    $('theme-export-btn')?.addEventListener('click', exportThemeConfig);
    $('theme-import-btn')?.addEventListener('click', importThemeConfig);
    $('theme-import-file')?.addEventListener('change', handleThemeImport);
    
    // Settings
    $('settings-save-btn').addEventListener('click', saveSettings);
    
    // Feature flag toggle - save immediately on change
    const spellLookupSwitch = $('setting-spell-lookup');
    if (spellLookupSwitch) {
      spellLookupSwitch.addEventListener('sl-change', () => {
        saveFeatureFlags();
      });
    }
    
    // Quota & Rate Limit management
    $('quota-refresh-btn').addEventListener('click', loadQuotaStats);
    $('rate-limit-reset-btn').addEventListener('click', resetRateLimits);
    $('quota-reset-images-btn').addEventListener('click', (e) => resetQuotas('images', e.target.closest('sl-button')));
    $('quota-reset-chars-btn').addEventListener('click', (e) => resetQuotas('characters', e.target.closest('sl-button')));
    $('quota-reset-all-btn').addEventListener('click', (e) => resetQuotas('all', e.target.closest('sl-button')));
    
    // Session expiry handling
    window.addEventListener('danddy:sessionExpired', () => {
      showToast('Your session has expired. Please log in again.', 'warning');
      handleLogout();
    });
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  async function init() {
    log('Initializing Admin App');
    
    setupEventListeners();
    syncPromptFormVisibility();
    
    // Check auth and show appropriate view
    const isAuth = await checkAuth();
    
    if (isAuth) {
      loadDashboardData();
    }
  }

  // Wait for DOM and Shoelace to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

