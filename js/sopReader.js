const SOP_DOCUMENTS = [
  {
    category: 'Billing & Payments',
    items: [
      { 
        id: 'billing-account-query', 
        label: 'Account query - Square payment not recorded', 
        driveFileId: '1or8bn27rmAIX-mKRVISorBCYckwikBiL41s0y8faRLA' 
      },
      { 
        id: 'billing-paying', 
        label: 'Billing SOP 2', 
        driveFileId: '' 
      }
    ]
  },

  {
    category: 'Membership',
    items: [
      { 
        id: 'membership-adjust-start-date', 
        label: 'Adjust membership start date', 
        driveFileId: '1iJvfS0JGWEiG_h7DzBxi2ELUhJgKhGw8MaE5GYHlGuA' 
      },
      { 
        id: 'membership-renewals', 
        label: 'Membership SOP 2', 
        driveFileId: '' 
      }
    ]
  },

  {
    category: 'Contacts & CRM',
    items: [
      { 
        id: 'contacts-merge-duplicates', 
        label: 'Merge duplicate contacts — Engage', 
        driveFileId: '1d5eSwBrtNj1vSMR4fBmiMbPbx450dTokrLGE_stEyQg' 
      }
    ]
  },

  {
    category: 'Invoicing',
    items: [
      { 
        id: 'invoicing-engage-gen', 
        label: 'Engage invoice generation', 
        driveFileId: '1NuV3LCdseTy06NJ2mKmO8abiV7X9eXnpIpmKHiV6oh0' 
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
        label: 'Actioning and saving emails', 
        driveFileId: '13dI2_6EAawsfbZsZilvHBeuW6l9V7giGTurq3wsxF3Y' 
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

//=====================================================================================

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

//=====================================================================================
function getSopById(id) {
  const foundItem = SOP_DOCUMENTS.flatMap(cat => cat.items).find(item => item.id === id);
  return foundItem || SOP_DOCUMENTS[0].items[0];
}

function getCategoryNameByItemId(itemId) {
  const categoryObj = SOP_DOCUMENTS.find(cat => cat.items.some(item => item.id === itemId));
  return categoryObj ? categoryObj.category : 'Process / SOP';
}

function getDrivePreviewUrl(fileId) {
  return 'https://docs.google.com/document/d/' + encodeURIComponent(fileId) + '/preview';
}

function renderSopAccordion(selectedId) {
  return SOP_DOCUMENTS.map((category, index) => {
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

  if (eyebrow) {
    eyebrow.textContent = getCategoryNameByItemId(item.id);
  }

  title.textContent = item.label;
  openLink.hidden = !item.driveFileId;
  openLink.href = item.driveFileId ? 'https://drive.google.com/file/d/' + encodeURIComponent(item.driveFileId) + '/view' : '#';

  if (!item.driveFileId || item.driveFileId.trim() === '') {
    frame.hidden = true;
    frame.src = 'about:blank';
    status.hidden = false;
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

function initSopReader() {
  const menu = document.getElementById('sopMenu');
  if (!menu) return;

  const defaultId = SOP_DOCUMENTS[0].items[0].id;
  const selectedId = new URLSearchParams(window.location.search).get('sop') || defaultId;
  
  menu.innerHTML = renderSopAccordion(selectedId);

  // Handle Collapsible Accordion Group Click
  menu.querySelectorAll('.sop-accordion-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const group = button.closest('.sop-accordion-group');
      const isOpen = group.classList.contains('open');
      
      // Close all other accordion groups (optional - keep only 1 open at a time)
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

  // Handle Sub-Item Click
  menu.querySelectorAll('[data-sop-id]').forEach(button => {
    button.addEventListener('click', () => {
      const item = getSopById(button.dataset.sopId);

      if (!item.driveFileId || item.driveFileId.trim() === '')  {
        showMissingFileNotice();
      }

      menu.querySelectorAll('.sop-menu-item').forEach(menuItem => menuItem.classList.remove('active'));
      button.classList.add('active');
      history.replaceState(null, '', '?sop=' + encodeURIComponent(item.id));
      renderSopDocument(item);
    });
  });

  renderSopDocument(getSopById(selectedId));
}

initSopReader();