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
  // INVITATION METHODS
  // ========================================

  /**
   * Get pending campaign invitations for the current user
   * @returns {Promise<Array>} List of pending invitations
   */
  async getPendingInvitations() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations...');
      const invitations = await this._apiRequest('/campaigns/invitations/pending');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch invitations:', error);
      throw error;
    }
  },

  /**
   * Invite a user to a campaign by email
   * @param {number} campaignId
   * @param {string} email
   * @returns {Promise<Object>} Invitation result
   */
  async inviteByEmail(campaignId, email) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Inviting', email, 'to campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to invite user:', error);
      throw error;
    }
  },

  /**
   * Get pending invitations sent from a campaign (for DM to see who's been invited)
   * @param {number} campaignId
   * @returns {Promise<Array>} List of pending invitations with email
   */
  async getCampaignPendingInvitations(campaignId) {
    // #region agent log - debug wrapper
    const { API_BASE_URL } = window.DanddyConfig || {};
    const fullUrl = `${API_BASE_URL}/campaigns/${campaignId}/pending-invitations`;
    fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'campaign-api.js:getCampaignPendingInvitations',message:'API call starting',data:{campaignId,fullUrl,API_BASE_URL},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H5'})}).catch(()=>{});
    // #endregion
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations for campaign', campaignId);
      const invitations = await this._apiRequest(`/campaigns/${campaignId}/pending-invitations`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'campaign-api.js:getCampaignPendingInvitations',message:'API success',data:{invitationsCount:invitations?.length,invitations},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bf1a39d7-1c35-40fc-94af-e8fe5dbe5644',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'campaign-api.js:getCampaignPendingInvitations',message:'API error caught',data:{errorMessage:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H3,H4'})}).catch(()=>{});
      // #endregion
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign pending invitations:', error);
      throw error;
    }
  },

  /**
   * Accept a campaign invitation
   * @param {number} campaignId
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async acceptInvitation(campaignId, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepting invitation for campaign', campaignId);
      const result = await this._apiRequest(`/campaigns/${campaignId}/accept-invitation`, {
        method: 'POST',
        body: JSON.stringify({ character_id: characterId }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepted invitation, now member of', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to accept invitation:', error);
      throw error;
    }
  },

  /**
   * Decline a campaign invitation
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async declineInvitation(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declining invitation for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/decline-invitation`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declined invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to decline invitation:', error);
      throw error;
    }
  },

  /**
   * Revoke a campaign invitation (DM only)
   * @param {number} campaignId
   * @param {number} invitationId - The membership/invitation ID to revoke
   * @returns {Promise<void>}
   */
  async revokeInvitation(campaignId, invitationId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoking invitation', invitationId, 'for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/revoke-invitation/${invitationId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoked invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to revoke invitation:', error);
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

  // ========================================
  // JOURNAL ENTRY METHODS
  // ========================================

  /**
   * Get journal entries for a character
   * @param {number} characterId
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} List of journal entries (newest first)
   */
  async getJournalEntries(characterId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entries for character', characterId);
      return await this._apiRequest(`/journal/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entries:', error);
      throw error;
    }
  },

  /**
   * Get a single journal entry
   * @param {number} entryId
   * @returns {Promise<Object>} Journal entry
   */
  async getJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entry:', error);
      throw error;
    }
  },

  /**
   * Create a new journal entry
   * @param {Object} data - { character_id, title, content, entry_date, campaign_id? }
   * @returns {Promise<Object>} Created journal entry
   */
  async createJournalEntry(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating entry:', data.title);
      const entry = await this._apiRequest('/journal/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Created entry', entry.id);
      return entry;
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create entry:', error);
      throw error;
    }
  },

  /**
   * Update a journal entry
   * @param {number} entryId
   * @param {Object} data - { title?, content?, entry_date? }
   * @returns {Promise<Object>} Updated journal entry
   */
  async updateJournalEntry(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Updating entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to update entry:', error);
      throw error;
    }
  },

  /**
   * Delete a journal entry
   * @param {number} entryId
   * @returns {Promise<void>}
   */
  async deleteJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleting entry', entryId);
      await this._apiRequest(`/journal/${entryId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleted entry', entryId);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to delete entry:', error);
      throw error;
    }
  },

  /**
   * Create a character update linked to a journal entry
   * @param {number} entryId - Journal entry to link
   * @param {Object} data - { xp_gained, gold_change, hp_change, items_acquired, items_lost, conditions }
   * @returns {Promise<Object>} Character update record
   */
  async createCharacterUpdate(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating character update for entry', entryId);
      return await this._apiRequest(`/journal/${entryId}/character-update`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create character update:', error);
      throw error;
    }
  },
});

if (DEBUG_CAMPAIGN) {
  console.log('🏰 Campaign API Service loaded');
}

