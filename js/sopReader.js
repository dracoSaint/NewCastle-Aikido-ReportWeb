const DEFAULT_SOP_DOCUMENTS = [
  {
    category: 'Billing & Payments',
    items: [
      {
        id: 'billing-account-query',
        label: 'Billing - Account query - Square payment not recorded',
        driveFileId: '1or8bn27rmAIX-mKRVISorBCYckwikBiL41s0y8faRLA'
      },
      {
        id: 'billing-acknowldge-fees',
        label: 'Billing - Acknowledge email and save as “fees adjusted”',
        driveFileId: '1DqhJvTetDkyp2sVBSgcUSvAARH-BaIZw6gx1xFKRmQk'
      },
      {
        id: 'billing-card-stolen',
        label: 'Billing - Ask for new card as card stolen',
        driveFileId: '1Tiz7D363uC-lmB55-ECfvHSMbRjhPjOi4hcMDqcC7Cg'
      },
      {
        id: 'billing-filing-receipt',
        label: 'Billing - Filing a Zen Planner receipt',
        driveFileId: '1re1GkslTivUOXAjC9YeYCKJpXBQ-rQdBqTpH4RjPGbg'
      },
      {
        id: 'billing-update-payment',
        label: 'Billing - Member updated payment details',
        driveFileId: '1cSBqU2HimbLutkCfSDp65OvbXGkv5G6VvQExL9qNes4'
      },
      {
        id: 'billing-request-tech-support',
        label: 'Billing - Requesting Zen Planner tech support (reporting problem)',
        driveFileId: '1QCqV1hM25Mx4TuM4YiQUZ2UnP6PaR9RefaBEgZStfk0'
      },
      {
        id: 'billing-zenplanner-doubled',
        label: 'Billing - Zen Planner billing doubled',
        driveFileId: '1NaILtnyI79k_hJ7xl3UbxWeqSQR6yAPx9NN4HYs-FxU'
      }
    ]
  },
  {
    category: 'Membership',
    items: [
      {
        id: 'membership-adjust-start-date',
        label: 'Membership - Adjust membership start date',
        driveFileId: '1iJvfS0JGWEiG_h7DzBxi2ELUhJgKhGw8MaE5GYHlGuA'
      },
      {
        id: 'membership-adjust-length',
        label: 'Membership - Adjusting membership length',
        driveFileId: '1BOLzYU1FImmes_pHD9M2M5G-FFdgLpefyHU9DLCrRbI'
      },
      {
        id: 'membership-cancel-set-follow-up',
        label: 'Membership - Cancel membership — example, set follow-up',
        driveFileId: '1ZoWIzD0-Viw22_mYM4kIgw1RruTE0ixWI4F9QXkI_O4'
      },
      {
        id: 'membership-cancelling',
        label: 'Membership - Cancelling a membership',
        driveFileId: '1EHgBm0Z96tblt7xB7Zw7yeLqidxs67q12OR_8AEMwQs'
      },
      {
        id: 'membership-merging-duplicate',
        label: 'Membership - Merging duplicated memberships',
        driveFileId: '1_Ay3wnL5qEBAW6nkZfVX0EmWDTPrF723CqQMEDX4DkY'
      },
      {
        id: 'membership-pausing',
        label: 'Membership - Pausing a membership',
        driveFileId: '1IYfbb-KCkorObYQXhRnAEenn6TnnA1xJ3RghZ-JgX40'
      },
      {
        id: 'membership-rolling-week-to-week',
        label: 'Membership - Rolling from package to week-to-week',
        driveFileId: '1dZrrqna9ulnXLtTwctCafwhGxN0GhAvQirNUUIvRov8'
      }
    ]
  },
  {
    category: 'Contacts & CRM',
    items: [
      {
        id: 'contacts-merge-duplicates',
        label: 'Contacts & CRM - Merge duplicate contacts — Engage',
        driveFileId: '1d5eSwBrtNj1vSMR4fBmiMbPbx450dTokrLGE_stEyQg'
      },
      {
        id: 'contacts-converting',
        label: 'Contacts & CRM - Opportunities — converting them',
        driveFileId: '1YIrbEPJx57Q3lQVR5M6z09a7UY5M1oQnpFOk1R0a67o'
      },
      {
        id: 'contacts-update-contacts',
        label: 'Contacts & CRM - Update contact details in ZP and Engage',
        driveFileId: '19ZhkC_rwzmFJf-ocxKUlZbWqW1xJtaXdOJ9jz2MZKh4'
      }
    ]
  },
  {
    category: 'Invoicing',
    items: [
      {
        id: 'invoicing-engage-gen',
        label: 'Invoicing - Engage invoice generation',
        driveFileId: '1NuV3LCdseTy06NJ2mKmO8abiV7X9eXnpIpmKHiV6oh0'
      },
      {
        id: 'invoicing-school-sport',
        label: 'Invoicing - School Sport invoice',
        driveFileId: '1J-2A3JkNA-nn_3_Qj9dpV-K0heJMp1wyhFE432YW0Jo'
      }
    ]
  },
  {
    category: 'Enquiries & Leads',
    items: [
      {
        id: 'enquiries-emails-jr',
        label: 'Enquiry email process (junior program)',
        driveFileId: '1ks65jfE5fS-l3Ms4due_bWb5HCefASLMC3w4bTX5be4'
      }
    ]
  },
  {
    category: 'Email & Inbox Admin',
    items: [
      {
        id: 'email-action-saving',
        label: 'Email & Inbox - Actioning and saving emails',
        driveFileId: '13dI2_6EAawsfbZsZilvHBeuW6l9V7giGTurq3wsxF3Y'
      },
      {
        id: 'email-filing-mushin',
        label: 'Emails & Inbox - Email Filing Drahc Mushin and other',
        driveFileId: '1T1B-V8YThSqZDwdV9i6l519L-5A4rPBO3-y3sEgNzLo'
      },
      {
        id: 'email-filing-google',
        label: 'Emails & Inbox - Email Filing Google Ad Snapshot',
        driveFileId: '1vWUoq1_TfE0UV7Iu8_mHQVHd8Ri7_x2OFfRkKfhFHlA'
      },
      {
        id: 'email-filing-homeoffice',
        label: 'Emails & Inbox - Email Filing Home office Rent',
        driveFileId: '16e0aXDcmH1h-RVnsO0dSB6i05h68jb4mHt5CY7SHfeE'
      },
      {
        id: 'email-1',
        label: 'Emails & Inbox - 1',
        driveFileId: ''
      },
      {
        id: 'email-2',
        label: 'Emails & Inbox - 2',
        driveFileId: ''
      },
      {
        id: 'email-3',
        label: 'Emails & Inbox - 3',
        driveFileId: ''
      }
    ]
  },
  {
    category: 'Grading & Attendance',
    items: [
      {
        id: 'grading-member-hour-report',
        label: 'Getting member grading-hour reports',
        driveFileId: '179rxcSU0exMMD-mN88hEFgY3cFCTO2bJtQ6tJCcZM2c'
      }
    ]
  },
  {
    category: 'Phones',
    items: [
      {
        id: 'phones-diverting-calls',
        label: 'Diverting calls',
        driveFileId: '1y2MjlX7s_gR3Hgak9oco9TBSG5d-G6ojAODytSjDKMI'
      }
    ]
  }
];

const SOP_STORAGE_KEY = 'wrkpod-sop-library';
const SOP_TABLE = 'sop_documents';

function loadSopDocumentsFromLocalStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOP_STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
  } catch (error) {
    console.warn('Failed to load saved SOP library:', error);
  }

  localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(DEFAULT_SOP_DOCUMENTS));
  return JSON.parse(JSON.stringify(DEFAULT_SOP_DOCUMENTS));
}

function normalizeSopRow(row = {}) {
  return {
    id: String(row.id || row.sop_id || '').trim(),
    category: String(row.category || 'General').trim(),
    label: String(row.label || row.title || '').trim(),
    driveFileId: String(row.drive_file_id || row.driveFileId || '').trim()
  };
}

function buildCategoryGroupsFromRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const normalized = normalizeSopRow(row);
    if (!normalized.id || !normalized.label) continue;

    if (!grouped.has(normalized.category)) {
      grouped.set(normalized.category, { category: normalized.category, items: [] });
    }

    grouped.get(normalized.category).items.push({
      id: normalized.id,
      label: normalized.label,
      driveFileId: normalized.driveFileId
    });
  }

  return Array.from(grouped.values());
}

function flattenSopDocuments(documents) {
  return documents.flatMap(category => category.items.map(item => ({
    id: item.id,
    category: category.category,
    label: item.label,
    drive_file_id: item.driveFileId || ''
  })));
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load resource: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load resource: ${src}`));
    document.head.appendChild(script);
  });
}

async function getSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;

  if (typeof supabase === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  }

  if (typeof config === 'undefined') {
    const configUrl = new URL('../../js/config.js', window.location.href).href;
    await loadScript(configUrl);
  }

  if (!window.supabaseClient) {
    window.supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  return window.supabaseClient;
}

async function loadSopDocumentsFromSupabase() {
  try {
    const supabaseClient = await getSupabaseClient();
    const { data, error } = await supabaseClient
      .from(SOP_TABLE)
      .select('*')
      .order('category', { ascending: true })
      .order('label', { ascending: true });

    if (error) {
      throw error;
    }

    const nextDocuments = buildCategoryGroupsFromRows(data || []);
    if (nextDocuments.length > 0) {
      SOP_DOCUMENTS = nextDocuments;
      localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(SOP_DOCUMENTS));
      return;
    }
  } catch (error) {
    console.warn('Supabase SOP library unavailable; falling back to local storage.', error);
  }

  SOP_DOCUMENTS = loadSopDocumentsFromLocalStorage();
}

async function syncSopDocumentsToSupabase() {
  try {
    const supabaseClient = await getSupabaseClient();
    const rows = flattenSopDocuments(SOP_DOCUMENTS);

    if (!rows.length) {
      localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(SOP_DOCUMENTS));
      return;
    }

    const { error } = await supabaseClient
      .from(SOP_TABLE)
      .upsert(rows.map(row => ({
        id: row.id,
        category: row.category,
        label: row.label,
        drive_file_id: row.drive_file_id
      })), { onConflict: 'id' });

    if (error) {
      throw error;
    }

    localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(SOP_DOCUMENTS));
  } catch (error) {
    console.warn('Unable to sync SOP data to Supabase, saving locally instead.', error);
    localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(SOP_DOCUMENTS));
  }
}

let SOP_DOCUMENTS = loadSopDocumentsFromLocalStorage();

function getAllCategories() {
  return SOP_DOCUMENTS.map(category => category.category);
}

function ensureCategory(categoryName) {
  const trimmed = String(categoryName || '').trim();
  if (!trimmed) return null;

  let category = SOP_DOCUMENTS.find(item => item.category.toLowerCase() === trimmed.toLowerCase());
  if (!category) {
    category = { category: trimmed, items: [] };
    SOP_DOCUMENTS.push(category);
  }

  return category;
}

function generateUniqueSopId(baseLabel) {
  const cleanBase = String(baseLabel || 'new-sop')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'new-sop';

  const usedIds = new Set(SOP_DOCUMENTS.flatMap(category => category.items.map(item => item.id)));
  let candidate = cleanBase;
  let suffix = 1;

  while (usedIds.has(candidate)) {
    candidate = `${cleanBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function addSopDocument({ category, title, driveFileId }) {
  const categoryObj = ensureCategory(category);
  if (!categoryObj) return null;

  const nextItem = {
    id: generateUniqueSopId(title),
    label: title.trim(),
    driveFileId: String(driveFileId || '').trim()
  };

  categoryObj.items.push(nextItem);
  await syncSopDocumentsToSupabase();
  return nextItem;
}

async function updateSopDocument(itemId, updates) {
  const categoryIndex = SOP_DOCUMENTS.findIndex(category => category.items.some(item => item.id === itemId));
  if (categoryIndex === -1) return null;

  const item = SOP_DOCUMENTS[categoryIndex].items.find(item => item.id === itemId);
  if (!item) return null;

  if (updates.category) {
    const nextCategory = updates.category.trim();
    if (!nextCategory) return null;

    const originalCategory = SOP_DOCUMENTS[categoryIndex].category;
    if (originalCategory !== nextCategory) {
      const sourceCategory = SOP_DOCUMENTS[categoryIndex];
      const targetCategory = ensureCategory(nextCategory);

      if (!targetCategory) return null;

      targetCategory.items.push({ ...item, label: String(updates.title || item.label).trim(), driveFileId: String(updates.driveFileId ?? item.driveFileId).trim() });
      sourceCategory.items = sourceCategory.items.filter(entry => entry.id !== itemId);

      if (sourceCategory.items.length === 0) {
        SOP_DOCUMENTS.splice(categoryIndex, 1);
      }
    }
  }

  const currentItem = SOP_DOCUMENTS.flatMap(category => category.items).find(entry => entry.id === itemId);
  if (!currentItem) return null;

  if (updates.title) currentItem.label = updates.title.trim();
  if (updates.driveFileId !== undefined) currentItem.driveFileId = String(updates.driveFileId || '').trim();

  await syncSopDocumentsToSupabase();
  return currentItem;
}

async function deleteSopDocument(itemId) {
  const categoryIndex = SOP_DOCUMENTS.findIndex(category => category.items.some(item => item.id === itemId));
  if (categoryIndex === -1) return;

  SOP_DOCUMENTS[categoryIndex].items = SOP_DOCUMENTS[categoryIndex].items.filter(item => item.id !== itemId);

  if (SOP_DOCUMENTS[categoryIndex].items.length === 0) {
    SOP_DOCUMENTS.splice(categoryIndex, 1);
  }

  await syncSopDocumentsToSupabase();
}

let noticeTimer;
function showMissingFileNotice() {
  let notice = document.querySelector('.feature-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'feature-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.appendChild(notice);
  }

  notice.textContent = "Sorry, this feature isn't finished yet. Please check back in a bit! ☹️";
  notice.classList.add('visible');

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3000);
}

function getSopById(id) {
  if (!SOP_DOCUMENTS || SOP_DOCUMENTS.length === 0) return null;

  const foundItem = SOP_DOCUMENTS.flatMap(cat => cat.items).find(item => item.id === id);
  if (foundItem) return foundItem;

  const firstCategory = SOP_DOCUMENTS.find(cat => Array.isArray(cat.items) && cat.items.length > 0);
  return firstCategory ? firstCategory.items[0] : null;
}

function getCategoryNameByItemId(itemId) {
  const categoryObj = SOP_DOCUMENTS.find(cat => cat.items.some(item => item.id === itemId));
  return categoryObj ? categoryObj.category : 'Process / SOP';
}

function getDrivePreviewUrl(fileId) {
  return 'https://docs.google.com/document/d/' + encodeURIComponent(fileId) + '/preview';
}

function getFirstAvailableSopId() {
  const firstItem = SOP_DOCUMENTS.flatMap(category => category.items).find(item => item && item.id);
  return firstItem ? firstItem.id : '';
}

function syncSelectedSopState(itemId) {
  const id = itemId || getFirstAvailableSopId();
  if (!id) {
    history.replaceState(null, '', window.location.pathname);
    return null;
  }

  history.replaceState(null, '', '?sop=' + encodeURIComponent(id));
  return id;
}

function refreshSopCategoryOptions(selectedValue) {
  const categorySelect = document.getElementById('sopCategorySelect');
  if (!categorySelect) return;

  const currentSelection = selectedValue || '';
  const values = getAllCategories();
  const optionValues = values.filter(Boolean);

  categorySelect.innerHTML = [
    '<option value="">Select a category</option>',
    '<option value="__new__">+ Add new category</option>',
    ...optionValues.map(category => `<option value="${escapeSopHtml(category)}">${escapeSopHtml(category)}</option>`)
  ].join('');

  categorySelect.value = currentSelection && optionValues.includes(currentSelection) ? currentSelection : '';
  const newCategoryField = document.getElementById('newCategoryField');
  const showNewCategory = categorySelect.value === '__new__';
  newCategoryField.classList.toggle('hidden', !showNewCategory);
  if (!showNewCategory) {
    document.getElementById('sopNewCategoryInput').value = '';
  }
}

function openSopModal(mode = 'add', item = null) {
  const modal = document.getElementById('sopModal');
  const form = document.getElementById('sopForm');
  const modalTitle = document.getElementById('sopModalTitle');

  if (!modal || !form) return;

  form.reset();
  form.dataset.mode = mode;
  form.dataset.editingId = item ? item.id : '';

  if (mode === 'edit' && item) {
    refreshSopCategoryOptions(item.category || '');
    document.getElementById('sopTitleInput').value = item.label || '';
    document.getElementById('sopDriveIdInput').value = item.driveFileId || '';
    modalTitle.textContent = 'Edit SOP';
  } else {
    refreshSopCategoryOptions();
    modalTitle.textContent = 'Add New SOP';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeSopModal() {
  const modal = document.getElementById('sopModal');
  const form = document.getElementById('sopForm');
  if (!modal || !form) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  form.reset();
  form.dataset.mode = 'add';
  form.dataset.editingId = '';
  refreshSopCategoryOptions();
}

function renderSopAccordion(selectedId) {
  if (!SOP_DOCUMENTS.length) {
    return `
      <div class="sop-empty-state">No SOPs saved yet. Click “Add New SOP” to create one.</div>
    `;
  }

  return SOP_DOCUMENTS.map((category) => {
    const isCategoryActive = category.items.some(item => item.id === selectedId);

    return `
      <div class="sop-accordion-group${isCategoryActive ? ' open' : ''}">
        <button type="button" class="sop-accordion-toggle" aria-expanded="${isCategoryActive}">
          <span>${escapeSopHtml(category.category)}</span>
          <span class="sop-chevron">▾</span>
        </button>
        <div class="sop-accordion-content">
          <div class="sop-menu-items">
            ${category.items.map(item => `
              <button class="sop-menu-item${item.id === selectedId ? ' active' : ''}" type="button" data-sop-id="${item.id}">
                ${escapeSopHtml(item.label)}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSopDocument(item) {
  const title = document.getElementById('sopTitle');
  const eyebrow = document.querySelector('.sop-eyebrow');
  const status = document.getElementById('sopStatus');
  const frame = document.getElementById('sopFrame');
  const openLink = document.getElementById('openSopLink');
  const deleteBtn = document.getElementById('deleteSopBtn');
  const editBtn = document.getElementById('editSopBtn');

  if (!item) {
    if (title) title.textContent = 'No SOP selected';
    if (eyebrow) eyebrow.textContent = 'Process / SOP';
    if (openLink) openLink.hidden = true;
    if (deleteBtn) deleteBtn.hidden = true;
    if (editBtn) editBtn.hidden = true;
    if (frame) {
      frame.hidden = true;
      frame.src = 'about:blank';
    }
    if (status) {
      status.hidden = false;
      status.innerHTML = '<strong>No SOPs available.</strong><span>Use “Add New SOP” to create one.</span>';
    }
    return;
  }

  if (eyebrow) {
    eyebrow.textContent = getCategoryNameByItemId(item.id);
  }

  title.textContent = item.label;
  openLink.hidden = !item.driveFileId;
  openLink.href = item.driveFileId ? 'https://drive.google.com/file/d/' + encodeURIComponent(item.driveFileId) + '/view' : '#';
  deleteBtn.hidden = false;
  editBtn.hidden = false;

  if (!item.driveFileId || item.driveFileId.trim() === '') {
    frame.hidden = true;
    frame.src = 'about:blank';
    status.hidden = false;
    status.innerHTML = '<strong>Google Drive file not connected yet.</strong><span>Add the Drive file ID for this SOP in the form below.</span>';
    return;
  }

  status.hidden = true;
  frame.hidden = false;
  frame.src = getDrivePreviewUrl(item.driveFileId);
}

function escapeSopHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function initSopReader() {
  const menu = document.getElementById('sopMenu');
  const addSopBtn = document.getElementById('addSopBtn');
  const editSopBtn = document.getElementById('editSopBtn');
  const deleteSopBtn = document.getElementById('deleteSopBtn');
  const modal = document.getElementById('sopModal');
  const categorySelect = document.getElementById('sopCategorySelect');
  const newCategoryField = document.getElementById('newCategoryField');
  const sopForm = document.getElementById('sopForm');
  const cancelSopBtn = document.getElementById('cancelSopBtn');
  const closeSopModalBtn = document.getElementById('closeSopModalBtn');

  if (!menu) return;

  await loadSopDocumentsFromSupabase();

  const requestedId = new URLSearchParams(window.location.search).get('sop');
  const initialId = SOP_DOCUMENTS.flatMap(category => category.items).some(item => item.id === requestedId)
    ? requestedId
    : getFirstAvailableSopId();

  if (initialId) {
    syncSelectedSopState(initialId);
  }

  function rebuildMenuAndSelection(selectedId) {
    const validSelectedId = SOP_DOCUMENTS.flatMap(category => category.items).some(item => item.id === selectedId)
      ? selectedId
      : getFirstAvailableSopId();

    menu.innerHTML = renderSopAccordion(validSelectedId);
    menu.querySelectorAll('.sop-accordion-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.closest('.sop-accordion-group');
        const isOpen = group.classList.contains('open');

        menu.querySelectorAll('.sop-accordion-group').forEach(otherGroup => {
          if (otherGroup !== group) {
            otherGroup.classList.remove('open');
            otherGroup.querySelector('.sop-accordion-toggle').setAttribute('aria-expanded', 'false');
          }
        });

        group.classList.toggle('open', !isOpen);
        button.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    });

    menu.querySelectorAll('[data-sop-id]').forEach(button => {
      button.addEventListener('click', () => {
        const item = getSopById(button.dataset.sopId);

        if (!item || (!item.driveFileId || item.driveFileId.trim() === '')) {
          showMissingFileNotice();
        }

        menu.querySelectorAll('.sop-menu-item').forEach(menuItem => menuItem.classList.remove('active'));
        button.classList.add('active');
        syncSelectedSopState(item.id);
        renderSopDocument(item);
      });
    });

    const selectedItem = getSopById(validSelectedId);
    renderSopDocument(selectedItem);
  }

  addSopBtn.addEventListener('click', () => openSopModal('add', null));

  editSopBtn.addEventListener('click', () => {
    const selectedId = new URLSearchParams(window.location.search).get('sop') || getFirstAvailableSopId();
    if (!selectedId) return;

    const selectedItem = getSopById(selectedId);
    if (!selectedItem) return;

    openSopModal('edit', selectedItem);
  });

  deleteSopBtn.addEventListener('click', async () => {
    const selectedId = new URLSearchParams(window.location.search).get('sop') || getFirstAvailableSopId();
    if (!selectedId) return;

    const selectedItem = getSopById(selectedId);
    if (!selectedItem) return;

    const shouldDelete = window.confirm(`Delete the SOP "${selectedItem.label}"?`);
    if (!shouldDelete) return;

    await deleteSopDocument(selectedId);

    const nextId = getFirstAvailableSopId();
    if (nextId) {
      syncSelectedSopState(nextId);
      rebuildMenuAndSelection(nextId);
    } else {
      menu.innerHTML = renderSopAccordion('');
      renderSopDocument(null);
      history.replaceState(null, '', window.location.pathname);
    }
  });

  categorySelect.addEventListener('change', () => {
    const showNewCategory = categorySelect.value === '__new__';
    newCategoryField.classList.toggle('hidden', !showNewCategory);
    if (!showNewCategory) {
      document.getElementById('sopNewCategoryInput').value = '';
    }
  });

  sopForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const isEditing = sopForm.dataset.mode === 'edit';
    const editingId = sopForm.dataset.editingId || '';
    const selectedCategory = categorySelect.value === '__new__'
      ? document.getElementById('sopNewCategoryInput').value.trim()
      : categorySelect.value.trim();
    const title = document.getElementById('sopTitleInput').value.trim();
    const driveFileId = document.getElementById('sopDriveIdInput').value.trim();

    if (!selectedCategory) {
      window.alert('Please select or create a category.');
      return;
    }

    if (!title) {
      window.alert('Please add an SOP title.');
      return;
    }

    if (!driveFileId) {
      window.alert('Please enter the Google Doc ID.');
      return;
    }

    try {
      let result;
      if (isEditing && editingId) {
        result = await updateSopDocument(editingId, {
          category: selectedCategory,
          title,
          driveFileId
        });
      } else {
        result = await addSopDocument({
          category: selectedCategory,
          title,
          driveFileId
        });
      }

      if (!result) {
        window.alert('Unable to save this SOP. Please try again.');
        return;
      }

      closeSopModal();
      syncSelectedSopState(result.id);
      rebuildMenuAndSelection(result.id);
    } catch (error) {
      console.error('SOP save failed:', error);
      window.alert('Unable to save this SOP. Please try again.');
    }
  });

  cancelSopBtn.addEventListener('click', closeSopModal);
  closeSopModalBtn.addEventListener('click', closeSopModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeSopModal();
  });

  refreshSopCategoryOptions();
  rebuildMenuAndSelection(initialId || getFirstAvailableSopId());
}

initSopReader();