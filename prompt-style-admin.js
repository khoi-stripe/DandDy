(function () {
  const STORAGE_KEY = 'dnd_portrait_prompt_entries_v1';

  /**
   * @typedef {'race' | 'class' | 'scene' | 'style'} EntryKind
   *
   * @typedef {Object} PromptEntry
   * @property {string} id
   * @property {EntryKind} kind
   * @property {string} key
   * @property {string} description
   * @property {string=} styleDescription
   * @property {string} createdAt
   * @property {string} updatedAt
   */

  /** @returns {PromptEntry[]} */
  function loadEntries() {
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
        saveEntries(migrated);
      }

      return migrated;
    } catch (e) {
      console.warn('PromptStyleAdmin: failed to load entries', e);
      return [];
    }
  }

  /** @param {PromptEntry[]} entries */
  function saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []));
    } catch (e) {
      console.warn('PromptStyleAdmin: failed to save entries', e);
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
      tr.innerHTML = `
        <td>${entry.kind}</td>
        <td>${entry.key || ''}</td>
        <td>${entry.kind === 'style' ? (entry.styleDescription || '') : (entry.description || '')}</td>
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

    if (descriptionField) {
      descriptionField.style.display = styleFieldsVisible ? 'none' : 'block';
    }
    if (styleDescriptionField) {
      styleDescriptionField.style.display = styleFieldsVisible ? 'block' : 'none';
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

  function init() {
    let entries = loadEntries();
    renderTable(entries);

    const form = $('recordForm');
    if (form) {
      form.addEventListener('submit', (e) => {
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
            entries[idx] = nextEntry;
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
          entries.push(newEntry);
        }

        saveEntries(entries);
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

    const clearAllBtn = $('btnClearAll');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (
          !confirm(
            'Clear all locally stored portrait prompt records for this browser?',
          )
        ) {
          return;
        }
        entries = [];
        saveEntries(entries);
        renderTable(entries);
        resetForm();
      });
    }

    const tbody = $('recordsTbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
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
          entries = entries.filter((e) => e.id !== id);
          saveEntries(entries);
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


