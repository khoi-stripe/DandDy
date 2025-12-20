// ========================================
// CAMPAIGN API SERVICE
// ========================================
// Handles campaign and session operations for campaign tracking feature

const DEBUG_CAMPAIGN = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

const CampaignAPI = (window.CampaignAPI = {
  
  // ========================================
  // HELPER METHODS
  // ========================================
  
  // Make authenticated API request (reuses pattern from CharacterCloudStorage)
  async _apiRequest(endpoint, options = {}) {
    const { API_BASE_URL } = window.DanddyConfig || {};
    const token = window.AuthService?.getToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      window.AuthService?.clearToken();
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const detail = typeof error.detail === 'string'
        ? error.detail
        : JSON.stringify(error.detail || error);
      console.error('Campaign API error:', error);
      throw new Error(detail || `API error: ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  },

  // ========================================
  // CAMPAIGN METHODS
  // ========================================

  /**
   * Get all campaigns the user is a member of
   * @returns {Promise<Array>} List of campaigns
   */
  async getCampaigns() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaigns...');
      const campaigns = await this._apiRequest('/campaigns/');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', campaigns.length, 'campaigns');
      return campaigns;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaigns:', error);
      throw error;
    }
  },

  /**
   * Get a single campaign with characters
   * @param {number} campaignId
   * @returns {Promise<Object>} Campaign with characters
   */
  async getCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign:', error);
      throw error;
    }
  },

  /**
   * Create a new campaign
   * @param {Object} data - { name, description? }
   * @returns {Promise<Object>} Created campaign
   */
  async createCampaign(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Creating campaign:', data.name);
      const campaign = await this._apiRequest('/campaigns/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Created with invite code:', campaign.invite_code);
      return campaign;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to create campaign:', error);
      throw error;
    }
  },

  /**
   * Update a campaign
   * @param {number} campaignId
   * @param {Object} data - { name?, description?, status? }
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaign(campaignId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Updating campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to update campaign:', error);
      throw error;
    }
  },

  /**
   * Delete a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async deleteCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleting campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleted successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to delete campaign:', error);
      throw error;
    }
  },

  /**
   * Regenerate invite code for a campaign
   * @param {number} campaignId
   * @returns {Promise<Object>} Updated campaign with new invite code
   */
  async regenerateInviteCode(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Regenerating invite code for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/regenerate-code`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to regenerate invite code:', error);
      throw error;
    }
  },

  // ========================================
  // JOIN / MEMBERSHIP METHODS
  // ========================================

  /**
   * Join a campaign using an invite code
   * @param {string} inviteCode
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async joinCampaign(inviteCode, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joining with code:', inviteCode);
      const result = await this._apiRequest('/campaigns/join', {
        method: 'POST',
        body: JSON.stringify({
          invite_code: inviteCode,
          character_id: characterId,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joined campaign:', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to join campaign:', error);
      throw error;
    }
  },

  /**
   * Get all members of a campaign
   * @param {number} campaignId
   * @returns {Promise<Array>} List of members
   */
  async getCampaignMembers(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching members for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/members`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch members:', error);
      throw error;
    }
  },

  /**
   * Assign a character to your campaign membership
   * @param {number} campaignId
   * @param {number} characterId
   * @returns {Promise<Object>} Updated membership
   */
  async assignCharacter(campaignId, characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Assigning character', characterId, 'to campaign', campaignId);
      return await this._apiRequest(
        `/campaigns/${campaignId}/members/assign-character?character_id=${characterId}`,
        { method: 'PUT' }
      );
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to assign character:', error);
      throw error;
    }
  },

  /**
   * Leave a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async leaveCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Leaving campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/members/leave`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Left successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to leave campaign:', error);
      throw error;
    }
  },

  // ========================================
  // SESSION METHODS
  // ========================================

  /**
   * Start a new session for a character
   * @param {number} characterId
   * @param {number?} campaignId - Optional, uses character's campaign if not provided
   * @param {string?} name - Optional session name
   * @returns {Promise<Object>} Created session
   */
  async startSession(characterId, campaignId = null, name = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Starting session for character', characterId);
      const session = await this._apiRequest('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({
          character_id: characterId,
          campaign_id: campaignId,
          name: name,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Started session #', session.session_number);
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to start session:', error);
      throw error;
    }
  },

  /**
   * End a session with optional post-session log
   * @param {number} sessionId
   * @param {Object?} logData - Optional post-session data
   * @returns {Promise<Object>} Completed session with log
   */
  async endSession(sessionId, logData = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Ending session', sessionId);
      const session = await this._apiRequest(`/sessions/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify(logData || {}),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Session ended');
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to end session:', error);
      throw error;
    }
  },

  /**
   * Cancel an active session without logging
   * @param {number} sessionId
   * @returns {Promise<Object>} Cancelled session
   */
  async cancelSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Cancelling session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/cancel`, { method: 'POST' });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to cancel session:', error);
      throw error;
    }
  },

  /**
   * Get active session for a character
   * @param {number} characterId
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Checking active session for character', characterId);
      return await this._apiRequest(`/sessions/active?character_id=${characterId}`);
    } catch (error) {
      // 404 means no active session, which is fine
      if (error.message.includes('404')) {
        return null;
      }
      console.error('🎲 SESSION ERROR: Failed to check active session:', error);
      throw error;
    }
  },

  /**
   * Get session history for a character
   * @param {number} characterId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCharacterSessions(characterId, limit = 20) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for character', characterId);
      return await this._apiRequest(`/sessions/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch character sessions:', error);
      throw error;
    }
  },

  /**
   * Get all sessions for a campaign
   * @param {number} campaignId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCampaignSessions(campaignId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for campaign', campaignId);
      return await this._apiRequest(`/sessions/campaign/${campaignId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch campaign sessions:', error);
      throw error;
    }
  },

  /**
   * Get a specific session
   * @param {number} sessionId
   * @returns {Promise<Object>} Session with log
   */
  async getSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch session:', error);
      throw error;
    }
  },

  /**
   * Add or update session log (for backdated entries)
   * @param {number} sessionId
   * @param {Object} logData
   * @returns {Promise<Object>} Session log
   */
  async addSessionLog(sessionId, logData) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Adding log to session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/log`, {
        method: 'POST',
        body: JSON.stringify(logData),
      });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to add session log:', error);
      throw error;
    }
  },
});

if (DEBUG_CAMPAIGN) {
  console.log('🏰 Campaign API Service loaded');
}

