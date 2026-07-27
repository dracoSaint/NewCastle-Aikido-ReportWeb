const SOP_DOCUMENTS = [
  {
    category: 'Process / SOP',
    items: [
      { id: 'billing', label: 'Billing & Payments', driveFileId: '1or8bn27rmAIX-mKRVISorBCYckwikBiL41s0y8faRLA' },
      { id: 'membership', label: 'Membership', driveFileId: '1iJvfS0JGWEiG_h7DzBxi2ELUhJgKhGw8MaE5GYHlGuA' },
      { id: 'contacts', label: 'Contacts & CRM', driveFileId: '1d5eSwBrtNj1vSMR4fBmiMbPbx450dTokrLGE_stEyQg' },
      { id: 'invoicing', label: 'Invoicing', driveFileId: '1NuV3LCdseTy06NJ2mKmO8abiV7X9eXnpIpmKHiV6oh0' },
      { id: 'enquiries', label: 'Enquiries & Leads', driveFileId: '1ks65jfE5fS-l3Ms4due_bWb5HCefASLMC3w4bTX5be4' },
      { id: 'email', label: 'Email & Inbox Admin', driveFileId: '13dI2_6EAawsfbZsZilvHBeuW6l9V7giGTurq3wsxF3Y' },
      { id: 'grading', label: 'Grading & Attendance', driveFileId: '179rxcSU0exMMD-mN88hEFgY3cFCTO2bJtQ6tJCcZM2c' },
      { id: 'phones', label: 'Phones', driveFileId: '1y2MjlX7s_gR3Hgak9oco9TBSG5d-G6ojAODytSjDKMI' }
    ]
  }
];

function getSopById(id) {
  return SOP_DOCUMENTS.flatMap(category => category.items).find(item => item.id === id) || SOP_DOCUMENTS[0].items[0];
}

function getDrivePreviewUrl(fileId) {
  return 'https://docs.google.com/document/d/' + encodeURIComponent(fileId) + '/pub?embedded=true';
}

function renderSopMenu(selectedId) {
  return SOP_DOCUMENTS.map(category => `
    <section class="sop-menu-category">
      <h2>${escapeSopHtml(category.category)}</h2>
      <div class="sop-menu-items">
        ${category.items.map(item => `
          <button class="sop-menu-item${item.id === selectedId ? ' active' : ''}" type="button" data-sop-id="${item.id}">
            ${escapeSopHtml(item.label)}
          </button>`).join('')}
      </div>
    </section>
  `).join('');
}

function renderSopDocument(item) {
  const title = document.getElementById('sopTitle');
  const status = document.getElementById('sopStatus');
  const frame = document.getElementById('sopFrame');
  const openLink = document.getElementById('openSopLink');

  title.textContent = item.label;
  openLink.hidden = !item.driveFileId;
  openLink.href = item.driveFileId ? 'https://drive.google.com/file/d/' + encodeURIComponent(item.driveFileId) + '/view' : '#';

  if (!item.driveFileId) {
    frame.hidden = true;
    status.hidden = false;
    status.innerHTML = '<strong>Google Drive file not connected yet.</strong><span>Add the Drive file ID for this SOP in <code>js/sopReader.js</code>.</span>';
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

  const selectedId = new URLSearchParams(window.location.search).get('sop') || 'billing';
  menu.innerHTML = renderSopMenu(selectedId);

  menu.querySelectorAll('[data-sop-id]').forEach(button => {
    button.addEventListener('click', () => {
      const item = getSopById(button.dataset.sopId);
      menu.querySelectorAll('.sop-menu-item').forEach(menuItem => menuItem.classList.remove('active'));
      button.classList.add('active');
      history.replaceState(null, '', '?sop=' + encodeURIComponent(item.id));
      renderSopDocument(item);
    });
  });

  renderSopDocument(getSopById(selectedId));
}

initSopReader();
