(function () {
  const STORAGE_KEY = 'dnd_portrait_prompt_entries_v1';

  /**
   * @typedef {'race' | 'class' | 'pose' | 'camera' | 'scene' | 'style'} EntryKind
   *
   * @typedef {Object} PromptEntry
   * @property {string} id
   * @property {EntryKind} kind
   * @property {string} key
   * @property {string} description
   * @property {string=} styleDescription
   * @property {boolean=} isDefault - true if this is a built-in default entry
   * @property {string} createdAt
   * @property {string} updatedAt
   */

  // ========================================
  // API CLIENT (for authenticated users)
  // ========================================
  const API_BASE = (window.DanddyConfig && window.DanddyConfig.API_BASE_URL) || 'http://localhost:8000/api';

  function getAuthToken() {
    return window.AuthService && window.AuthService.getToken ? window.AuthService.getToken() : null;
  }

  function isAuthenticated() {
    return window.AuthService && window.AuthService.isAuthenticated ? window.AuthService.isAuthenticated() : false;
  }

  async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errText}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // Fetch all entries from API
  async function fetchEntriesFromAPI() {
    const data = await apiRequest('/prompt-entries');
    // Map API response to local format
    return (data || []).map(apiEntryToLocal);
  }

  // Create entry via API
  async function createEntryViaAPI(entry) {
    const payload = localEntryToAPI(entry);
    const created = await apiRequest('/prompt-entries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return apiEntryToLocal(created);
  }

  // Update entry via API
  async function updateEntryViaAPI(id, entry) {
    const payload = localEntryToAPI(entry);
    const updated = await apiRequest(`/prompt-entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return apiEntryToLocal(updated);
  }

  // Delete entry via API
  async function deleteEntryViaAPI(id) {
    await apiRequest(`/prompt-entries/${id}`, { method: 'DELETE' });
  }

  // Bulk create entries via API
  async function bulkCreateViaAPI(entries) {
    const payload = { entries: entries.map(localEntryToAPI) };
    const created = await apiRequest('/prompt-entries/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return (created || []).map(apiEntryToLocal);
  }

  // Delete all entries via API
  async function deleteAllViaAPI() {
    await apiRequest('/prompt-entries', { method: 'DELETE' });
  }

  // Convert API entry to local format
  function apiEntryToLocal(apiEntry) {
    return {
      id: String(apiEntry.id),
      kind: apiEntry.kind,
      key: apiEntry.key,
      description: apiEntry.description || '',
      styleDescription: apiEntry.style_description || '',
      createdAt: apiEntry.created_at,
      updatedAt: apiEntry.updated_at,
    };
  }

  // Convert local entry to API format
  function localEntryToAPI(entry) {
    return {
      kind: entry.kind,
      key: entry.key,
      description: entry.description || '',
      style_description: entry.styleDescription || null,
    };
  }

  // Track if we're using cloud storage
  let usingCloud = false;

  // ========================================
  // DEFAULT POSE & CAMERA DATA
  // ========================================
  const DEFAULT_POSES = {
    fighter: [
      'posed mid-swing with a heavy weapon, body twisted to show the arc of the strike',
      'standing in a ready battle stance, shield raised and weapon held low but tense',
      'caught in the moment of blocking an attack, weight shifted back with shield braced',
      'bust-length portrait (shoulders-up chest shot), armor and pauldrons filling most of the frame, weapon only implied near the edge of the composition',
      'half-body view from the top of the head to the waist, shield and weapon crossing in front of the torso in a strong diagonal',
    ],
    barbarian: [
      'leaning forward in a feral roar, muscles tensed, weapon mid-swing',
      'standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands',
      'caught mid-leap as if diving into battle, hair and trophies flying outward',
      'bust-length portrait (shoulders-up) with wild hair and trophies framing the face, weapon only partially visible',
      'half-body view from head to waist, torso twisted slightly as they grip a massive weapon across their body',
    ],
    paladin: [
      'kneeling with shield planted in front, weapon held upright in a solemn vow pose',
      'standing tall with shield forward and weapon raised in a protective gesture',
      'framed in a side stance, shield angled and weapon ready for a precise strike',
      'bust-length portrait (chest and shoulders) with polished armor and holy symbol prominent, gaze lifted slightly upward',
      'half-body view from head to waist, shield raised to one side and weapon held upright along the torso',
    ],
    rogue: [
      'crouched low in the shadows, one dagger drawn and the other held behind for balance',
      'leaning casually against an unseen wall, one hand resting on a hidden blade',
      'mid-step on a narrow ledge, body turned sideways with cloak pulled close',
      'bust-length portrait (shoulders-up) emerging from shadow, cloak and hood framing the face, one dagger just at the edge of frame',
      'half-body view from head to waist, body angled three-quarter with one hand resting lightly on a hidden blade at the belt',
    ],
    monk: [
      'balanced on one leg in a classic kick pose, arms forming a flowing guard shape',
      'mid-strike with an open palm, body rotated and lines clean and focused',
      'seated in calm meditation, legs crossed and hands resting in a composed mudra',
      'bust-length portrait (shoulders-up), calm expression and neatly arranged robes, one hand raised near the chest in a subtle gesture',
      'half-body view from head to waist in a centered stance, arms forming a clean symmetrical guard in front of the torso',
    ],
    ranger: [
      'drawing a bow with the string fully pulled, body turned in a three-quarter stance',
      'kneeling on one knee with bow lowered, scanning the distance like a watchful scout',
      'mid-stride through an implied forest floor, bow held loosely but ready',
      'bust-length portrait (shoulders-up) with cloak and quiver framing the head and shoulders, bow only hinted at near the edge of frame',
      'half-body view from head to waist, bow held across the chest in a relaxed but ready posture',
    ],
    wizard: [
      'standing with one hand raised and fingers splayed, arcane energy swirling upward',
      'leaning over an invisible spellbook, staff angled forward as if channeling power',
      'mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion',
      'bust-length portrait (shoulders-up) with arcane light reflecting off the face and shoulders, staff or spell effect just entering frame',
      'half-body view from head to waist, one arm across the torso cradling a spellbook while the other hand traces glowing sigils',
    ],
    sorcerer: [
      'surrounded by swirling magical energy, one hand outstretched and the other pulled close',
      'standing with arms wide, raw power coiling around their torso and shoulders',
      'mid-step as a surge of magic bursts from the ground around their feet',
      'bust-length portrait (shoulders-up) wreathed in subtle magical glow around the shoulders and chest, expression intense',
      'half-body view from head to waist, arms drawn in close as swirling power wraps the upper torso',
    ],
    warlock: [
      'holding a pact focus or talisman forward, dark energy streaming from it',
      'standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes',
      'reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind',
      'bust-length portrait (shoulders-up) with pact focus or talisman held near the chest, faint eldritch patterns behind the head and shoulders',
      'half-body view from head to waist, cloak falling around the torso while one hand rests lightly on a focus at the belt',
    ],
    cleric: [
      'raising a holy symbol high, light radiating outward in a protective arc',
      'standing with shield angled and mace lowered, posture firm and resolute',
      'kneeling in prayerful focus, holy symbol clasped between both hands',
      'bust-length portrait (shoulders-up) with holy symbol and upper armor prominent in frame, expression serene but resolute',
      'half-body view from head to waist, shield or mace held close to the torso in a protective stance',
    ],
    druid: [
      'standing with staff planted in the earth, vines and leaves swirling around',
      'mid-transformation pose, body partly turned and framed by natural shapes',
      'kneeling to touch the ground, one hand extended as if coaxing growth',
      'bust-length portrait (shoulders-up) framed by leaves, branches, or antler-like shapes around the head and shoulders',
      'half-body view from head to waist, staff or natural focus held across the chest with cloak or furs draped over the shoulders',
    ],
    bard: [
      'mid-performance with an instrument, one foot forward and body open to an unseen crowd',
      'leaning back in a dramatic flourish, cloak and hair trailing with the motion',
      'perched casually on an unseen stool or crate, instrument resting comfortably in hand',
      'bust-length portrait (shoulders-up) with instrument or microphone-like focus near the chest, hair and clothing adding dynamic shapes',
      'half-body view from head to waist, instrument cradled against the torso in a relaxed, performative pose',
    ],
    default: [
      'standing in a relaxed but heroic stance, weight shifted slightly to one side',
      'mid-stride as if walking toward the viewer with confident energy',
      'standing in profile with head turned toward the viewer, posture composed and steady',
      'bust-length portrait (shoulders-up) with the character centered in frame, clothing and armor details emphasized around the chest and shoulders',
      'half-body view from head to waist, stance relaxed but confident with hands or a weapon resting near the torso',
    ],
  };

  const DEFAULT_CAMERAS = {
    fighter: [
      'Camera angle: slightly low and three-quarter to emphasize strength and presence.',
      'Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.',
      'Camera angle: three-quarter from the shield side, highlighting defense and stance.',
      'Camera angle: slightly above, looking down to show battlefield context around the figure.',
      'Camera angle: close to ground level, making the character loom large in the frame.',
    ],
    barbarian: [
      'Camera angle: low and close, exaggerating size and ferocity.',
      'Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.',
      'Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.',
      'Camera angle: pulled back to show the full silhouette and large weapon in motion.',
      'Camera angle: slightly below the shoulders, looking up into a battle roar.',
    ],
    paladin: [
      'Camera angle: eye-level, straight on, emphasizing honor and symmetry.',
      'Camera angle: slightly low, looking up past the shield to give a guardian feeling.',
      'Camera angle: three-quarter from the weapon side, showing both devotion and readiness.',
      'Camera angle: slightly above, as if from the viewpoint of someone being protected.',
      'Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.',
    ],
    rogue: [
      'Camera angle: slightly above and to the side, emphasizing stealth and environment.',
      'Camera angle: three-quarter from behind, with the face turned back toward the viewer.',
      'Camera angle: low and angled sharply, creating long, dramatic shadows.',
      'Camera angle: tight framing around the upper body, leaving the background mostly in shadow.',
      'Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.',
    ],
    monk: [
      'Camera angle: mid-distance and centered, capturing clean lines of the martial pose.',
      'Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.',
      'Camera angle: from above, looking down on a circular stance pattern.',
      'Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.',
      'Camera angle: side-on profile to highlight precision and alignment of the form.',
    ],
    ranger: [
      'Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.',
      'Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.',
      'Camera angle: slightly elevated, framing the ranger and implied terrain below.',
      'Camera angle: low and angled upward through implied undergrowth or rough ground.',
      'Camera angle: mid-distance, with the character slightly off-center to suggest open space.',
    ],
    wizard: [
      'Camera angle: three-quarter, framing both staff and spell effect in the same view.',
      'Camera angle: slightly low, making the spellcasting gesture feel towering and grand.',
      'Camera angle: slightly above, looking down on a circle of arcane energy.',
      'Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.',
      'Camera angle: oblique and off-center, with arcane elements framing the composition.',
    ],
    sorcerer: [
      'Camera angle: close and low, centered on the chest where power is gathering.',
      'Camera angle: three-quarter from the side, showing energy spiraling around the figure.',
      'Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.',
      'Camera angle: tight framing on the face and hands, emphasizing raw intensity.',
      'Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.',
    ],
    warlock: [
      'Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.',
      'Camera angle: three-quarter from behind, looking toward an unseen source of power.',
      'Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.',
      'Camera angle: close to the focus or talisman, with the character looming just behind it.',
      "Camera angle: slightly above, letting eldritch patterns form around the character's feet.",
    ],
    cleric: [
      'Camera angle: slightly low, looking up toward the raised holy symbol.',
      'Camera angle: eye-level, centered to evoke balance and stability.',
      'Camera angle: three-quarter, allowing both shield and symbol to read clearly.',
      'Camera angle: slightly above, as if from the viewpoint of a blessed ally.',
      'Camera angle: mid-distance with the character framed symmetrically in the composition.',
    ],
    druid: [
      'Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.',
      'Camera angle: three-quarter, with implied branches or leaves partially framing the view.',
      "Camera angle: slightly above, looking down as if from a bird's-eye vantage.",
      'Camera angle: eye-level but softened, placing the character gently into the environment.',
      'Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.',
    ],
    bard: [
      'Camera angle: eye-level, as if the viewer is part of an unseen audience.',
      'Camera angle: three-quarter, capturing both gesture and instrument clearly.',
      'Camera angle: slightly low, turning a performance flourish into a heroic moment.',
      'Camera angle: above and angled, as if looking down from a balcony over a small stage.',
      'Camera angle: tight around the upper body and instrument, focusing on expression.',
    ],
    default: [
      'Camera angle: three-quarter view that clearly shows the full silhouette.',
      'Camera angle: eye-level, centered, with the figure dominating the frame.',
      'Camera angle: slightly low, making the character feel larger and more heroic.',
      'Camera angle: slightly above, looking down just enough to show shoulders and gear.',
      'Camera angle: mid-distance with the character placed slightly off-center for balance.',
    ],
  };

  /**
   * Generate default pose/camera entries for loading into storage.
   * @returns {PromptEntry[]}
   */
  function generateDefaultEntries() {
    const entries = [];
    const nowIso = new Date().toISOString();
    let idCounter = 0;

    // Generate pose entries
    Object.keys(DEFAULT_POSES).forEach((classKey) => {
      DEFAULT_POSES[classKey].forEach((pose) => {
        entries.push({
          id: `default_pose_${classKey}_${idCounter++}`,
          kind: 'pose',
          key: classKey,
          description: pose,
          isDefault: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
    });

    // Generate camera entries
    Object.keys(DEFAULT_CAMERAS).forEach((classKey) => {
      DEFAULT_CAMERAS[classKey].forEach((camera) => {
        entries.push({
          id: `default_camera_${classKey}_${idCounter++}`,
          kind: 'camera',
          key: classKey,
          description: camera,
          isDefault: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
    });

    return entries;
  }

  /** @returns {Promise<PromptEntry[]>} */
  async function loadEntries() {
    // Try API first if authenticated
    if (isAuthenticated()) {
      try {
        const entries = await fetchEntriesFromAPI();
        usingCloud = true;
        updateStorageStatus();
        // Cache in localStorage so builder/manager can read them
        saveEntriesToLocalStorage(entries);
        return entries;
      } catch (e) {
        console.warn('PromptStyleAdmin: API load failed, falling back to localStorage', e);
      }
    }

    // Fall back to localStorage
    usingCloud = false;
    updateStorageStatus();
    return loadEntriesFromLocalStorage();
  }

  // Sync local cache after cloud operations
  function syncLocalCache(entries) {
    saveEntriesToLocalStorage(entries);
    // Invalidate PortraitPrompt cache so it picks up new entries
    if (window.PortraitPrompt && typeof PortraitPrompt.invalidateCache === 'function') {
      PortraitPrompt.invalidateCache();
    }
  }

  /** @returns {PromptEntry[]} */
  function loadEntriesFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Lightweight migration: older entries may still use "background"
      // as a kind. Treat them as "scene" going forward.
      let changed = false;
      const migrated = parsed.map((entry) => {
        if (entry && entry.kind === 'background') {
          changed = true;
          return { ...entry, kind: 'scene' };
        }
        return entry;
      });

      if (changed) {
        saveEntriesToLocalStorage(migrated);
      }

      return migrated;
    } catch (e) {
      console.warn('PromptStyleAdmin: failed to load entries from localStorage', e);
      return [];
    }
  }

  /** @param {PromptEntry[]} entries */
  function saveEntriesToLocalStorage(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []));
    } catch (e) {
      console.warn('PromptStyleAdmin: failed to save entries to localStorage', e);
    }
  }

  function createId() {
    return (
      'ps_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function updateStorageStatus() {
    const statusEl = $('storageStatus');
    if (!statusEl) return;
    
    if (usingCloud) {
      statusEl.innerHTML = '<span class="status-cloud">☁️ Cloud storage (synced)</span>';
      statusEl.className = 'storage-status cloud';
    } else if (isAuthenticated()) {
      statusEl.innerHTML = '<span class="status-local">⚠️ Using local storage (API unavailable)</span>';
      statusEl.className = 'storage-status local-fallback';
    } else {
      statusEl.innerHTML = '<span class="status-local">💾 Local storage only — <a href="#" onclick="event.preventDefault(); window.location.href=\'/\';">log in</a> to sync</span>';
      statusEl.className = 'storage-status local';
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function normalize(str) {
    return (str || '').toString().trim();
  }

  function matchesFilter(value, filter) {
    const v = normalize(value).toLowerCase();
    const f = normalize(filter).toLowerCase();
    if (!f) return true;
    return v.includes(f);
  }

  function renderTable(entries) {
    const tbody = $('recordsTbody');
    if (!tbody) return;

    const kindFilter = $('filterKind')?.value || '';
    const keyFilter = $('filterKey')?.value || '';
    const textFilter = $('filterText')?.value || '';

    const filtered = entries.filter((e) => {
      const kindOk = kindFilter ? e.kind === kindFilter : true;
      return (
        kindOk &&
        matchesFilter(e.key, keyFilter) &&
        (matchesFilter(e.description, textFilter) ||
          matchesFilter(e.styleDescription, textFilter))
      );
    });

    tbody.innerHTML = '';

    if (!filtered.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-state-row';
      tr.innerHTML =
        '<td colspan="5"><div class="empty-state">No entries match your filters.</div></td>';
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.dataset.id = entry.id;
      const defaultBadge = entry.isDefault ? '<span class="tag-default">default</span>' : '';
      const descText = entry.kind === 'style' ? (entry.styleDescription || '') : (entry.description || '');
      // Truncate long descriptions for display
      const truncatedDesc = descText.length > 80 ? descText.slice(0, 77) + '...' : descText;
      tr.innerHTML = `
        <td>${entry.kind}${defaultBadge}</td>
        <td>${entry.key || ''}</td>
        <td title="${descText.replace(/"/g, '&quot;')}">${truncatedDesc}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-xs" data-action="edit">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-action="delete">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function syncFormVisibility() {
    const kind = normalize($('kindInput').value) || 'race';
    const styleFieldsVisible = kind === 'style';

    const descriptionField = $('descriptionField');
    const styleDescriptionField = $('styleDescriptionField');
    const keyInput = $('keyInput');
    const keyHint = $('keyHint');
    const descriptionInput = $('descriptionInput');
    const descriptionLabel = $('descriptionLabel');
    const descriptionHint = $('descriptionHint');

    if (descriptionField) {
      descriptionField.style.display = styleFieldsVisible ? 'none' : 'block';
    }
    if (styleDescriptionField) {
      styleDescriptionField.style.display = styleFieldsVisible ? 'block' : 'none';
    }

    // Update placeholder and hints based on kind
    if (keyInput && keyHint && descriptionInput && descriptionLabel && descriptionHint) {
      if (kind === 'pose') {
        keyInput.placeholder = 'e.g. fighter, wizard, barbarian, default';
        keyHint.textContent = 'Use class id (fighter, wizard, etc.) or "default" for fallback poses.';
        descriptionLabel.textContent = 'Pose description';
        descriptionInput.placeholder = 'e.g. "standing in a ready battle stance, shield raised and weapon held low"';
        descriptionHint.innerHTML = 'Describes the character\'s body position and action. You can add multiple poses per class.';
      } else if (kind === 'camera') {
        keyInput.placeholder = 'e.g. fighter, wizard, barbarian, default';
        keyHint.textContent = 'Use class id (fighter, wizard, etc.) or "default" for fallback camera angles.';
        descriptionLabel.textContent = 'Camera angle description';
        descriptionInput.placeholder = 'e.g. "Camera angle: slightly low and three-quarter to emphasize strength"';
        descriptionHint.innerHTML = 'Describes the camera position and framing. Add multiple angles per class for variety.';
      } else if (kind === 'race') {
        keyInput.placeholder = 'e.g. dwarf, elf, human, tiefling';
        keyHint.textContent = 'Use the race id as it appears in character data.';
        descriptionLabel.textContent = 'Description snippet';
        descriptionInput.placeholder = 'e.g. "a grizzled dwarf with a braided beard and stocky build"';
        descriptionHint.innerHTML = 'Describes physical appearance for <code>{race}</code> in prompts.';
      } else if (kind === 'class') {
        keyInput.placeholder = 'e.g. fighter, wizard, cleric';
        keyHint.textContent = 'Use the class id as it appears in character data.';
        descriptionLabel.textContent = 'Description snippet';
        descriptionInput.placeholder = 'e.g. "wearing heavy plate armor and carrying a longsword"';
        descriptionHint.innerHTML = 'Describes class-specific gear/look for <code>{class}</code> in prompts.';
      } else if (kind === 'scene') {
        keyInput.placeholder = 'e.g. cinematic-inks, default';
        keyHint.textContent = 'Use a theme id or "default" for scene/background descriptions.';
        descriptionLabel.textContent = 'Scene/background description';
        descriptionInput.placeholder = 'e.g. "Abstract dark background with subtle atmospheric fog"';
        descriptionHint.innerHTML = 'Used for <code>Scene:</code> section in prompts.';
      } else if (kind === 'style') {
        keyInput.placeholder = 'e.g. cinematic-inks, my-custom-style';
        keyHint.textContent = 'Theme id for this style preset.';
      } else {
        // Default
        keyInput.placeholder = 'e.g. dwarf, fighter, default';
        keyHint.textContent = 'Key used to match this entry in prompts.';
        descriptionLabel.textContent = 'Description snippet';
        descriptionInput.placeholder = 'Description text...';
        descriptionHint.innerHTML = 'Text inserted into the prompt.';
      }
    }
  }

  function loadEntryIntoForm(entry) {
    $('entryId').value = entry.id || '';
    $('kindInput').value = entry.kind || 'race';
    $('keyInput').value = entry.key || '';
    $('descriptionInput').value = entry.description || '';
    $('styleDescriptionInput').value = entry.styleDescription || '';
    syncFormVisibility();
    const title = $('formTitle');
    if (title) title.textContent = 'Edit entry';
  }

  function resetForm() {
    $('entryId').value = '';
    $('kindInput').value = 'race';
    $('keyInput').value = '';
    $('descriptionInput').value = '';
    $('styleDescriptionInput').value = '';
    syncFormVisibility();
    const title = $('formTitle');
    if (title) title.textContent = 'New entry';
  }

  async function init() {
    let entries = await loadEntries();
    renderTable(entries);

    const form = $('recordForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = normalize($('entryId').value);
        const kind = /** @type {EntryKind} */ (
          normalize($('kindInput').value) || 'race'
        );
        const key = normalize($('keyInput').value);
        const description = normalize($('descriptionInput').value);
        const styleDescription = normalize(
          $('styleDescriptionInput').value,
        );

        if (!key) {
          alert('Key is required.');
          return;
        }

        const nowIso = new Date().toISOString();

        if (id) {
          // Update existing
          const idx = entries.findIndex((e) => e.id === id);
          if (idx !== -1) {
            const prev = entries[idx];
            const nextEntry = {
              ...prev,
              kind,
              key,
              updatedAt: nowIso,
            };
            if (kind === 'style') {
              nextEntry.styleDescription = styleDescription;
              nextEntry.description = '';
            } else {
              nextEntry.description = description;
              nextEntry.styleDescription = '';
            }
            
            // Update via API if using cloud
            if (usingCloud) {
              try {
                const updated = await updateEntryViaAPI(id, nextEntry);
                entries[idx] = updated;
                syncLocalCache(entries);
              } catch (err) {
                console.error('Failed to update via API:', err);
                alert('Failed to save to cloud. Changes saved locally.');
                entries[idx] = nextEntry;
                saveEntriesToLocalStorage(entries);
              }
            } else {
            entries[idx] = nextEntry;
              saveEntriesToLocalStorage(entries);
            }
          }
        } else {
          // Create new
          /** @type {PromptEntry} */
          const newEntry = {
            id: createId(),
            kind,
            key,
            description: '',
            styleDescription: '',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          if (kind === 'style') {
            newEntry.styleDescription = styleDescription;
          } else {
            newEntry.description = description;
          }
          
          // Create via API if using cloud
          if (usingCloud) {
            try {
              const created = await createEntryViaAPI(newEntry);
              entries.push(created);
              syncLocalCache(entries);
            } catch (err) {
              console.error('Failed to create via API:', err);
              alert('Failed to save to cloud. Changes saved locally.');
              entries.push(newEntry);
              saveEntriesToLocalStorage(entries);
            }
          } else {
          entries.push(newEntry);
            saveEntriesToLocalStorage(entries);
          }
        }

        renderTable(entries);
        resetForm();
      });
    }

    const resetBtn = $('btnResetForm');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetForm();
      });
    }

    const loadDefaultsBtn = $('btnLoadDefaults');
    if (loadDefaultsBtn) {
      loadDefaultsBtn.addEventListener('click', async () => {
        const existingPoses = entries.filter((e) => e.kind === 'pose').length;
        const existingCameras = entries.filter((e) => e.kind === 'camera').length;
        
        let msg = 'Load all default pose and camera entries?\n\n';
        msg += 'This will add 130 entries (65 poses + 65 cameras) for all 12 classes plus "default".\n\n';
        if (existingPoses > 0 || existingCameras > 0) {
          msg += `You currently have ${existingPoses} pose and ${existingCameras} camera entries.\n`;
          msg += 'Existing entries will be preserved; duplicates will be added.';
        }
        
        if (!confirm(msg)) {
          return;
        }
        
        const defaults = generateDefaultEntries();
        
        // Bulk create via API if using cloud
        if (usingCloud) {
          try {
            const created = await bulkCreateViaAPI(defaults);
            entries = entries.concat(created);
            syncLocalCache(entries);
          } catch (err) {
            console.error('Failed to bulk create via API:', err);
            alert('Failed to save to cloud. Changes saved locally.');
            entries = entries.concat(defaults);
            saveEntriesToLocalStorage(entries);
          }
        } else {
        entries = entries.concat(defaults);
          saveEntriesToLocalStorage(entries);
        }
        
        renderTable(entries);
        
        alert(`Loaded ${defaults.length} default entries (${defaults.filter(e => e.kind === 'pose').length} poses, ${defaults.filter(e => e.kind === 'camera').length} cameras).`);
      });
    }

    // Export to JSON file
    const exportBtn = $('btnExport');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        console.log('Export clicked, entries count:', entries.length);
        
        if (entries.length === 0) {
          alert('No entries to export.');
          return;
        }

        // Prepare export data (strip internal IDs for portability)
        const exportData = entries.map(e => ({
          kind: e.kind,
          key: e.key,
          description: e.description || '',
          styleDescription: e.styleDescription || '',
        }));

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link and trigger it
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `prompt-entries-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        
        // Use setTimeout to ensure the link is in the DOM before clicking
        setTimeout(() => {
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('Export download triggered');
        }, 100);

        alert(`Exported ${entries.length} entries to prompt-entries-${new Date().toISOString().slice(0, 10)}.json`);
      });
    } else {
      console.warn('Export button not found');
    }

    // Import from JSON file
    const importBtn = $('btnImport');
    const importFileInput = $('importFileInput');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => {
        importFileInput.click();
      });

      importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const imported = JSON.parse(text);

          if (!Array.isArray(imported)) {
            alert('Invalid format: expected an array of entries.');
            return;
          }

          // Validate entries
          const validKinds = ['race', 'class', 'pose', 'camera', 'scene', 'style'];
          const validEntries = imported.filter(e => 
            e && typeof e.key === 'string' && e.key.trim() &&
            validKinds.includes(e.kind)
          );

          if (validEntries.length === 0) {
            alert('No valid entries found in the file.');
            return;
          }

          const msg = `Import ${validEntries.length} entries?\n\n` +
            `This will ADD to your existing ${entries.length} entries.\n` +
            `Duplicates may be created.`;
          
          if (!confirm(msg)) {
            importFileInput.value = '';
            return;
          }

          // Prepare entries with timestamps
          const nowIso = new Date().toISOString();
          const newEntries = validEntries.map(e => ({
            id: createId(),
            kind: e.kind,
            key: e.key.trim(),
            description: (e.description || '').trim(),
            styleDescription: (e.styleDescription || '').trim(),
            createdAt: nowIso,
            updatedAt: nowIso,
          }));

          // Import via API if using cloud
          if (usingCloud) {
            try {
              const created = await bulkCreateViaAPI(newEntries);
              entries = entries.concat(created);
              syncLocalCache(entries);
            } catch (err) {
              console.error('Failed to import via API:', err);
              alert('Failed to import to cloud. Changes saved locally.');
              entries = entries.concat(newEntries);
              saveEntriesToLocalStorage(entries);
            }
          } else {
            entries = entries.concat(newEntries);
            saveEntriesToLocalStorage(entries);
          }

          renderTable(entries);
          alert(`Imported ${newEntries.length} entries.`);
        } catch (err) {
          console.error('Import failed:', err);
          alert('Failed to import: ' + err.message);
        } finally {
          importFileInput.value = '';
        }
      });
    }

    const clearAllBtn = $('btnClearAll');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        if (
          !confirm(
            'Clear all portrait prompt entries?',
          )
        ) {
          return;
        }
        
        // Delete all via API if using cloud
        if (usingCloud) {
          try {
            await deleteAllViaAPI();
            syncLocalCache([]);
          } catch (err) {
            console.error('Failed to delete all via API:', err);
            alert('Failed to delete from cloud.');
            return;
          }
        } else {
          saveEntriesToLocalStorage([]);
        }
        
        entries = [];
        renderTable(entries);
        resetForm();
      });
    }

    const tbody = $('recordsTbody');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!target) return;

        const action = target.getAttribute('data-action');
        if (!action) return;

        const row = target.closest('tr');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!id) return;

        const entry = entries.find((e) => e.id === id);
        if (!entry) return;

        if (action === 'edit') {
          loadEntryIntoForm(entry);
        } else if (action === 'delete') {
          if (!confirm('Delete this record?')) return;
          
          // Delete via API if using cloud
          if (usingCloud) {
            try {
              await deleteEntryViaAPI(id);
            } catch (err) {
              console.error('Failed to delete via API:', err);
              alert('Failed to delete from cloud.');
              return;
            }
          }
          
          entries = entries.filter((e) => e.id !== id);
          if (usingCloud) {
            syncLocalCache(entries);
          } else {
            saveEntriesToLocalStorage(entries);
          }
          renderTable(entries);
          // If we were editing this record, reset the form.
          if ($('entryId').value === id) {
            resetForm();
          }
        }
      });
    }

    ['filterKind', 'filterKey', 'filterText'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => renderTable(entries));
    });

    const kindInput = $('kindInput');
    if (kindInput) {
      kindInput.addEventListener('change', syncFormVisibility);
      syncFormVisibility();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


