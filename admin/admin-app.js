/**
 * DandDy Admin Application
 * Handles authentication, navigation, and admin operations
 */
(function (global) {
  'use strict';

  const cfg = global.DanddyConfig || {};
  const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const DEBUG = !!cfg.DEBUG;

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
    const token = state.token || AuthService.getToken();
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
    const token = AuthService.getToken();
    if (!token) {
      showLoginGate();
      return false;
    }

    try {
      const profile = await AuthService.fetchProfile();
      if (!profile) {
        showLoginGate();
        return false;
      }

      // Check if user is admin
      if (profile.role !== 'admin') {
        showToast('Admin access required. You do not have permission to access this area.', 'danger');
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
      showLoginGate();
      return false;
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
      errorMessage.textContent = 'Please enter email and password';
      errorAlert.classList.add('show');
      return;
    }
    
    loginBtn.loading = true;
    errorAlert.classList.remove('show');
    
    try {
      const result = await AuthService.login(email, password);
      
      if (!result.success) {
        throw new Error(result.error || 'Login failed');
      }
      
      // Verify admin role
      const profile = AuthService.getCurrentUser() || result.user;
      if (profile && profile.role !== 'admin') {
        AuthService.logout();
        throw new Error('Admin access required. Your account does not have admin privileges.');
      }
      
      state.token = AuthService.getToken();
      state.user = profile;
      state.isAdmin = true;
      
      $('user-email').textContent = profile.email || 'Admin';
      
      showAdminShell();
      loadDashboardData();
      
    } catch (err) {
      log('Login error:', err);
      errorMessage.textContent = err.message || 'Login failed';
      errorAlert.classList.add('show');
    } finally {
      loginBtn.loading = false;
    }
  }

  function handleLogout() {
    AuthService.logout();
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
      
      if (col === 'level' || col === 'id' || col === 'user_id') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
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
    
    $('prompt-description').parentElement.classList.toggle('hidden', isStyle);
    
    // Only admins can set global
    $('prompt-is-global').parentElement.classList.toggle('hidden', !state.isAdmin);
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
        <td colspan="5">
          <sl-spinner></sl-spinner>
          <span>Loading users...</span>
        </td>
      </tr>
    `;
    
    try {
      state.users = await apiRequest('/users/');
      state.filteredUsers = [...state.users];
      
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
      
    } catch (err) {
      log('Users load error:', err);
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="5" style="color: hsl(0, 100%, 50%);">
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
  }

  function renderUsersTable() {
    const tbody = $('users-tbody');
    
    if (state.filteredUsers.length === 0) {
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="5">No users found</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = state.filteredUsers.map(user => {
      const isCurrentUser = state.user && state.user.id === user.id;
      
      return `
        <tr data-id="${user.id}">
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
                <sl-button size="small" data-action="toggle-role" data-user-id="${user.id}" data-current-role="${user.role}">
                  ${user.role === 'admin' ? 'Demote' : 'Make Admin'}
                </sl-button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
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

  // ========================================
  // SETTINGS
  // ========================================
  function loadSettings() {
    // Settings are typically stored on the backend or in env vars
    // For now, just display placeholder values
    log('Settings section loaded');
  }

  async function saveSettings() {
    showToast('Settings save functionality coming soon', 'warning');
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
    
    // Users table events (delegation)
    $('users-tbody').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      
      const action = target.dataset.action;
      const userId = parseInt(target.dataset.userId, 10);
      
      if (action === 'toggle-role') {
        const currentRole = target.dataset.currentRole;
        toggleUserRole(userId, currentRole);
      }
    });
    
    // Settings
    $('settings-save-btn').addEventListener('click', saveSettings);
    
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

