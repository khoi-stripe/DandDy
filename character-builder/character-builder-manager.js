// Character Management Screen for the DandDy terminal character builder.
// Exposes CharacterManager as global on window.

const CharacterManager = (window.CharacterManager = {
  characters: [],
  campaigns: [],
  currentView: 'all', // 'all', 'campaign:id', 'unassigned'
  searchQuery: '',
  sortBy: 'name', // 'name', 'level', 'modified', 'campaign'
  
  // Show the character management screen
  async show() {
    console.log('📋 Loading character management screen...');
    
    // Hide splash and main content
    document.getElementById('splash-content')?.classList.add('is-hidden');
    document.getElementById('main-content')?.classList.add('is-hidden');
    
    // Remove any existing manager screen
    document.getElementById('manager-screen')?.remove();
    
    // Load data
    await this.loadData();
    
    // Create manager screen
    const managerScreen = document.createElement('div');
    managerScreen.id = 'manager-screen';
    managerScreen.className = 'manager-screen';
    managerScreen.innerHTML = this.renderHTML();
    
    document.querySelector('.terminal-container').appendChild(managerScreen);
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Initial render
    this.renderCharacterList();
  },
  
  // Load characters and campaigns
  async loadData() {
    try {
      // Load characters
      this.characters = await StorageService.getCharacters();
      console.log(`Loaded ${this.characters.length} characters`);
      
      // Load campaigns if authenticated
      if (AuthService.isAuthenticated()) {
        try {
          this.campaigns = await CharacterAPI.getCampaigns();
          console.log(`Loaded ${this.campaigns.length} campaigns`);
        } catch (error) {
          console.error('Failed to load campaigns:', error);
          this.campaigns = [];
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      this.characters = [];
      this.campaigns = [];
    }
  },
  
  // Render the main HTML structure
  renderHTML() {
    const user = AuthService.getCurrentUser();
    const userName = user ? user.username.toUpperCase() : 'GUEST';
    const userIcon = user?.role === 'dm' ? '🎲' : '⚔️';
    
    return `
      <div class="manager-container">
        <!-- Header -->
        <div class="manager-header">
          <div class="manager-title">
            ╔═════════════════════════════════════════════════════════════════╗
            ║                    CHARACTER MANAGEMENT                        ║
            ╚═════════════════════════════════════════════════════════════════╝
          </div>
          <div class="manager-user-info">
            ${userIcon} ${userName}
          </div>
        </div>
        
        <!-- Controls -->
        <div class="manager-controls">
          <div class="control-row">
            <div class="search-box">
              <input 
                type="text" 
                id="character-search" 
                class="terminal-input" 
                placeholder="[ SEARCH BY NAME, RACE, OR CLASS ]"
                value="${this.searchQuery}"
              />
            </div>
            <button id="btn-new-character" class="button-primary">
              <span class="button-icon">+</span> NEW CHARACTER
            </button>
          </div>
          
          <div class="control-row">
            <div class="filter-group">
              <label class="filter-label">[ FILTER ]</label>
              <select id="filter-campaign" class="terminal-select">
                <option value="all">All Characters</option>
                <option value="unassigned">Unassigned</option>
                ${this.campaigns.map(c => `<option value="campaign:${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            
            <div class="filter-group">
              <label class="filter-label">[ SORT BY ]</label>
              <select id="sort-by" class="terminal-select">
                <option value="name">Name</option>
                <option value="level">Level</option>
                <option value="campaign">Campaign</option>
              </select>
            </div>
            
            ${this.campaigns.length > 0 && user?.role === 'dm' ? `
              <button id="btn-manage-campaigns" class="button-secondary">
                <span class="button-icon">📋</span> CAMPAIGNS
              </button>
            ` : ''}
          </div>
        </div>
        
        <!-- Character List -->
        <div id="character-list" class="character-list">
          <!-- Characters will be rendered here -->
        </div>
        
        <!-- Footer Actions -->
        <div class="manager-footer">
          <button id="btn-back" class="button-secondary">
            <span class="button-icon">◀</span> BACK
          </button>
          ${AuthService.isAuthenticated() && this.characters.some(c => String(c.id).startsWith('local_')) ? `
            <button id="btn-migrate" class="button-primary">
              <span class="button-icon">↑</span> MIGRATE LOCAL CHARACTERS
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  // Attach event listeners
  attachEventListeners() {
    // Search
    const searchInput = document.getElementById('character-search');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderCharacterList();
    });
    
    // Filter
    const filterSelect = document.getElementById('filter-campaign');
    filterSelect?.addEventListener('change', (e) => {
      this.currentView = e.target.value;
      this.renderCharacterList();
    });
    
    // Sort
    const sortSelect = document.getElementById('sort-by');
    sortSelect?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderCharacterList();
    });
    
    // New Character
    document.getElementById('btn-new-character')?.addEventListener('click', () => {
      this.startNewCharacter();
    });
    
    // Back
    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.close();
    });
    
    // Migrate
    document.getElementById('btn-migrate')?.addEventListener('click', () => {
      this.migrateLocalCharacters();
    });
    
    // Manage Campaigns (DM only)
    document.getElementById('btn-manage-campaigns')?.addEventListener('click', () => {
      this.showCampaignManager();
    });
  },
  
  // Render the character list
  renderCharacterList() {
    const listContainer = document.getElementById('character-list');
    if (!listContainer) return;
    
    // Filter characters
    let filtered = this.filterCharacters();
    
    // Sort characters
    filtered = this.sortCharacters(filtered);
    
    // Render
    if (filtered.length === 0) {
      listContainer.innerHTML = this.renderEmptyState();
    } else {
      listContainer.innerHTML = filtered.map(char => this.renderCharacterCard(char)).join('');
      
      // Attach card event listeners
      filtered.forEach(char => {
        this.attachCardListeners(char);
      });
    }
  },
  
  // Filter characters based on search and view
  filterCharacters() {
    let filtered = [...this.characters];
    
    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(char => 
        char.name?.toLowerCase().includes(query) ||
        char.race?.toLowerCase().includes(query) ||
        char.class?.toLowerCase().includes(query)
      );
    }
    
    // Apply view filter
    if (this.currentView === 'unassigned') {
      filtered = filtered.filter(char => !char.campaignId);
    } else if (this.currentView.startsWith('campaign:')) {
      const campaignId = parseInt(this.currentView.split(':')[1]);
      filtered = filtered.filter(char => char.campaignId === campaignId);
    }
    
    return filtered;
  },
  
  // Sort characters
  sortCharacters(characters) {
    const sorted = [...characters];
    
    switch (this.sortBy) {
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'level':
        sorted.sort((a, b) => (b.level || 1) - (a.level || 1));
        break;
      case 'campaign':
        sorted.sort((a, b) => {
          const aCampaign = this.getCampaignName(a.campaignId) || 'Unassigned';
          const bCampaign = this.getCampaignName(b.campaignId) || 'Unassigned';
          return aCampaign.localeCompare(bCampaign);
        });
        break;
    }
    
    return sorted;
  },
  
  // Get campaign name by ID
  getCampaignName(campaignId) {
    if (!campaignId) return null;
    const campaign = this.campaigns.find(c => c.id === campaignId);
    return campaign?.name || null;
  },
  
  // Render empty state
  renderEmptyState() {
    if (this.characters.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">⚔️</div>
          <div class="empty-title">NO CHARACTERS YET</div>
          <div class="empty-message">
            Your adventure awaits! Create your first character to begin.
          </div>
          <button class="button-primary" onclick="CharacterManager.startNewCharacter()">
            <span class="button-icon">+</span> CREATE FIRST CHARACTER
          </button>
        </div>
      `;
    } else {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">NO MATCHES FOUND</div>
          <div class="empty-message">
            Try adjusting your search or filter criteria.
          </div>
        </div>
      `;
    }
  },
  
  // Render a character card
  renderCharacterCard(char) {
    const campaignName = this.getCampaignName(char.campaignId);
    const isLocal = String(char.id).startsWith('local_');
    const hpPercent = Math.round((char.currentHitPoints || char.hitPoints) / char.hitPoints * 100);
    const hpColor = hpPercent > 50 ? 'green' : hpPercent > 25 ? 'yellow' : 'red';
    
    return `
      <div class="character-card" data-character-id="${char.id}">
        <div class="card-header">
          <div class="card-title">
            <span class="char-name">${char.name || 'Unnamed'}</span>
            ${isLocal ? '<span class="local-badge">[LOCAL]</span>' : ''}
          </div>
          <span class="char-level">Lv ${char.level || 1}</span>
        </div>
        
        <div class="card-subtitle">
          ${char.race || 'Unknown'} ${char.class || 'Unknown'}
        </div>
        
        ${campaignName ? `
          <div class="card-campaign">
            📋 ${campaignName}
          </div>
        ` : ''}
        
        <div class="card-stats">
          <div class="stat-item">
            <span class="stat-label">HP:</span>
            <span class="stat-value stat-hp-${hpColor}">
              ${char.currentHitPoints || char.hitPoints}/${char.hitPoints}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">AC:</span>
            <span class="stat-value">${char.armorClass || 10}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Speed:</span>
            <span class="stat-value">${char.speed || 30}ft</span>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="card-btn" data-action="view" title="View Character">
            <span>👁️ VIEW</span>
          </button>
          <button class="card-btn" data-action="edit" title="Edit Character">
            <span>✏️ EDIT</span>
          </button>
          ${AuthService.isAuthenticated() && this.campaigns.length > 0 ? `
          <button class="card-btn" data-action="assign-campaign" title="Assign to Campaign">
            <span>📋 CAMPAIGN</span>
          </button>
          ` : ''}
          <button class="card-btn" data-action="duplicate" title="Duplicate Character">
            <span>📋 COPY</span>
          </button>
          <button class="card-btn" data-action="export" title="Export Character">
            <span>💾 EXPORT</span>
          </button>
          <button class="card-btn card-btn-danger" data-action="delete" title="Delete Character">
            <span>🗑️ DELETE</span>
          </button>
        </div>
      </div>
    `;
  },
  
  // Attach event listeners to a character card
  attachCardListeners(char) {
    const card = document.querySelector(`.character-card[data-character-id="${char.id}"]`);
    if (!card) return;
    
    const buttons = card.querySelectorAll('.card-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        this.handleCardAction(char, action);
      });
    });
    
    // Click card to view
    card.addEventListener('click', () => {
      this.viewCharacter(char);
    });
  },
  
  // Handle card action
  async handleCardAction(char, action) {
    switch (action) {
      case 'view':
        this.viewCharacter(char);
        break;
      case 'edit':
        this.editCharacter(char);
        break;
      case 'assign-campaign':
        await this.assignToCampaign(char);
        break;
      case 'duplicate':
        await this.duplicateCharacter(char);
        break;
      case 'export':
        this.exportCharacter(char);
        break;
      case 'delete':
        await this.deleteCharacter(char);
        break;
    }
  },
  
  // View character (show character sheet)
  viewCharacter(char) {
    console.log('View character:', char.name);
    // TODO: Show read-only character sheet
    alert(`View character sheet for ${char.name} (Coming soon!)`);
  },
  
  // Edit character (load in character builder)
  editCharacter(char) {
    console.log('Edit character:', char.name);
    // TODO: Load character in builder for editing
    alert(`Edit ${char.name} (Coming soon!)`);
  },
  
  // Assign character to campaign
  async assignToCampaign(char) {
    if (!AuthService.isAuthenticated()) {
      alert('Please log in to assign characters to campaigns');
      return;
    }
    
    if (this.campaigns.length === 0) {
      alert('No campaigns available. Create a campaign first!');
      return;
    }
    
    // Build options HTML
    const currentCampaignName = this.getCampaignName(char.campaignId) || 'None';
    let optionsHTML = '<option value="">Unassigned</option>';
    this.campaigns.forEach(campaign => {
      const selected = campaign.id === char.campaignId ? 'selected' : '';
      optionsHTML += `<option value="${campaign.id}" ${selected}>${campaign.name}</option>`;
    });
    
    // Show modal with campaign selector
    const modal = document.createElement('div');
    modal.className = 'prompt-modal-overlay';
    modal.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">ASSIGN TO CAMPAIGN</div>
        <div class="prompt-message">
          Character: <strong>${char.name}</strong><br>
          Current: <strong>${currentCampaignName}</strong>
        </div>
        <div class="form-group">
          <label class="form-label">[ SELECT CAMPAIGN ]</label>
          <select id="campaign-select" class="terminal-select">
            ${optionsHTML}
          </select>
        </div>
        <div class="prompt-buttons">
          <button class="prompt-modal-btn primary" id="assign-confirm">ASSIGN</button>
          <button class="prompt-modal-btn" id="assign-cancel">CANCEL</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle confirm
    document.getElementById('assign-confirm').addEventListener('click', async () => {
      const select = document.getElementById('campaign-select');
      const campaignId = select.value ? parseInt(select.value) : null;
      
      try {
        await CharacterAPI.assignToCampaign(char.id, campaignId);
        await this.loadData();
        this.renderCharacterList();
        modal.remove();
        
        const campaignName = campaignId ? this.getCampaignName(campaignId) : 'Unassigned';
        alert(`✅ ${char.name} assigned to: ${campaignName}`);
      } catch (error) {
        alert(`❌ Failed to assign character: ${error.message}`);
        modal.remove();
      }
    });
    
    // Handle cancel
    document.getElementById('assign-cancel').addEventListener('click', () => {
      modal.remove();
    });
    
    // Handle escape key
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },
  
  // Duplicate character
  async duplicateCharacter(char) {
    const newName = prompt(`Duplicate "${char.name}" as:`, `${char.name} (Copy)`);
    if (!newName) return;
    
    try {
      if (AuthService.isAuthenticated() && char.id && !String(char.id).startsWith('local_')) {
        // Use backend API for authenticated users with backend characters
        await CharacterAPI.duplicateCharacter(char.id, newName);
      } else {
        // Use localStorage for guest mode or local characters
        const duplicate = { ...char };
        delete duplicate.id;
        duplicate.name = newName;
        await StorageService.saveCharacter(duplicate);
      }
      
      await this.loadData();
      this.renderCharacterList();
      
      alert(`✅ Character duplicated as "${newName}"`);
    } catch (error) {
      alert(`❌ Failed to duplicate character: ${error.message}`);
    }
  },
  
  // Export character as JSON
  exportCharacter(char) {
    const json = JSON.stringify(char, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${char.name || 'character'}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    alert(`✅ Character exported as ${char.name}.json`);
  },
  
  // Delete character
  async deleteCharacter(char) {
    if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
    
    try {
      await StorageService.deleteCharacter(char.id);
      await this.loadData();
      this.renderCharacterList();
      
      alert(`✅ Character "${char.name}" deleted`);
    } catch (error) {
      alert(`❌ Failed to delete character: ${error.message}`);
    }
  },
  
  // Start new character creation
  startNewCharacter() {
    this.close();
    // The app will restart the character builder
    setTimeout(() => {
      const mainContent = document.getElementById('main-content');
      mainContent?.classList.remove('is-hidden');
      App.init();
    }, 300);
  },
  
  // Close manager and return to character builder
  close() {
    const managerScreen = document.getElementById('manager-screen');
    if (managerScreen) {
      managerScreen.style.opacity = '0';
      managerScreen.style.transition = 'opacity 0.3s ease-out';
      
      setTimeout(() => {
        managerScreen.remove();
        
        // Show main content
        const mainContent = document.getElementById('main-content');
        mainContent?.classList.remove('is-hidden');
      }, 300);
    }
  },
  
  // Migrate local characters to backend
  async migrateLocalCharacters() {
    if (!confirm('Migrate all local characters to your account? This will upload them to the server.')) {
      return;
    }
    
    try {
      const result = await StorageService.migrateToBackend();
      
      if (result.migrated.length > 0) {
        alert(`✅ Migrated ${result.migrated.length} character(s) successfully!`);
      }
      
      if (result.failed.length > 0) {
        alert(`⚠️ Failed to migrate ${result.failed.length} character(s). Check console for details.`);
        console.error('Migration failures:', result.failed);
      }
      
      // Reload
      await this.loadData();
      this.renderCharacterList();
    } catch (error) {
      alert(`❌ Migration failed: ${error.message}`);
    }
  },
  
  // Show campaign manager modal (DM only)
  showCampaignManager() {
    alert('Campaign manager coming soon!');
    // TODO: Implement campaign manager modal
  },
});

