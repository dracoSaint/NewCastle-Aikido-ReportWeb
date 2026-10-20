(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const homeUrl = new URL('index.html', siteRoot).href;
  const settingsUrl = new URL('pages/Settings.html', siteRoot).href;
  const tasksUrl = new URL('pages/Tasks.html', siteRoot).href;
  const logoUrl = new URL('imgs/aikido-logo-white.png', siteRoot).href; // white mark on the dark sidebar header

  // Line icons (24px grid, drawn with the current text colour).
  const ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    tasks: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    reports: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    contact: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 14h3"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'
  };
  const icon = name => `<svg class="drawer-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  const menuGroups = [
    {
      id: 'taskMenu',
      label: 'TASKS',
      icon: 'tasks',
      items: [
        { label: 'Task list', path: 'pages/Tasks.html', icon: 'tasks', count: true },
        { label: 'Add a task', path: 'pages/Tasks.html#new', icon: 'plus' }
      ]
    },
    {
      id: 'reportMenu',
      label: 'REPORTS',
      icon: 'reports',
      items: [
        { label: 'Grading Report', path: 'pages/REPORTs/GradingReport.html', icon: 'award' },
        { label: 'Monday Board Report', path: 'pages/REPORTs/MondayBoardReport.html', icon: 'calendar' },
        { label: 'Red / Orange Follow-Up', path: 'pages/REPORTs/FollowUpReport.html', icon: 'phone' },
        { label: 'Past Due Members', path: 'pages/REPORTs/PastDueMembers.html', icon: 'card' },
        { label: 'Daily Ad Review', path: 'pages/REPORTs/DailyAdReview.html', icon: 'megaphone' },
        { label: 'Geronimo Metrics Report', path: 'pages/REPORTs/GeronimoMetrics.html', icon: 'chart' }
      ]
    },
    {
      id: 'sopMenu',
      label: 'SOP',
      icon: 'book',
      items: [
        { label: 'Billing & Payments', path: 'pages/SOPs/SOPDocuments.html?sop=billing-account-query', icon: 'card' },
        { label: 'Membership', path: 'pages/SOPs/SOPDocuments.html?sop=membership-adjust-start-date', icon: 'users' },
        { label: 'Contacts & CRM', path: 'pages/SOPs/SOPDocuments.html?sop=contacts-merge-duplicates', icon: 'contact' },
        { label: 'Invoicing', path: 'pages/SOPs/SOPDocuments.html?sop=invoicing-engage-gen', icon: 'doc' },
        { label: 'Enquiries & Leads', path: 'pages/SOPs/SOPDocuments.html?sop=enquiries-emails-jr', icon: 'inbox' },
        { label: 'Email & Inbox Admin', path: 'pages/SOPs/SOPDocuments.html?sop=email-action-saving', icon: 'mail' },
        { label: 'Grading & Attendance', path: 'pages/SOPs/SOPDocuments.html?sop=grading-member-hour-report', icon: 'award' },
        { label: 'Phones', path: 'pages/SOPs/SOPDocuments.html?sop=phones-diverting-calls', icon: 'phone' }
      ]
    }
    // Another category: { id, label, icon, items: [{ label, path, icon }] }, icons from ICONS above.
  ];

  function getMenuUrl(path) {
    return new URL(path, siteRoot).href;
  }

  // Compared without ".html" or a trailing "index": hosts with pretty URLs (Cloudflare Pages) serve
  // /pages/Tasks.html as /pages/Tasks and index.html as /.
  const bare = url => url.split('#')[0].toLowerCase().replace(/\.html(?=$|\?)/, '').replace(/\/index(?=$|\?)/, '/');
  const here = bare(window.location.href);
  const isHere = url => bare(url) === here;

  function getNavigationItems() {
    return [
      { label: 'Home', category: 'Workspace', url: homeUrl },
      { label: 'Settings', category: 'Workspace', url: settingsUrl },
      ...menuGroups.flatMap(group => group.items.map(item => ({
        label: item.label,
        category: { REPORTS: 'Report', TASKS: 'Tasks' }[group.label] || 'SOP',
        url: getMenuUrl(item.path)
      })))
    ];
  }

  // Which categories are open is remembered per browser; first visit opens Tasks, Reports and the current page's.
  const OPEN_KEY = 'portal-menu-open';
  function readOpen() {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY)); } catch { return null; }
  }
  function saveOpen(ids) {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch {}
  }

  function renderMenuGroup(group, open) {
    const hasActive = group.items.some(item => !item.path.includes('#') && isHere(getMenuUrl(item.path)));
    const expanded = hasActive || (open ? open.includes(group.id) : group.id !== 'sopMenu');
    const items = group.items.map(item => {
      const itemUrl = getMenuUrl(item.path);
      const active = !item.path.includes('#') && isHere(itemUrl);
      const count = item.count ? '<span class="drawer-count" data-task-count hidden></span>' : '';
      return `<a href="${itemUrl}" title="${item.label}"${active ? ' class="active" aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span>${count}</a>`;
    }).join('');

    return `
      <div class="drawer-group${expanded ? ' expanded' : ''}" data-group="${group.id}">
        <button class="drawer-group-toggle" type="button" aria-expanded="${expanded}" aria-controls="${group.id}">
          <span class="drawer-group-label">${icon(group.icon)}<span>${group.label}</span></span>
          <span class="drawer-chevron" aria-hidden="true"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="drawer-submenu" id="${group.id}">${items}</div>
      </div>`;
  }

  function buildMenu() {
    const open = readOpen();
    const groups = menuGroups.map(group => renderMenuGroup(group, open)).join('');
    const brand = document.getElementById('siteBrand');
    if (brand && !document.getElementById('quickSwitcherTrigger')) {
      const trigger = document.createElement('button');
      trigger.id = 'quickSwitcherTrigger';
      trigger.className = 'quick-switcher-trigger';
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Find a report or SOP');
      trigger.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
      trigger.innerHTML = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><span>Find a page</span><kbd>Ctrl K</kbd>';
      const profile = brand.querySelector('.profile-dropdown-wrap');
      brand.insertBefore(trigger, profile || null);
    }

    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="quick-switcher" id="quickSwitcher" aria-label="Quick navigation">
        <div class="quick-switcher-panel">
          <div class="quick-switcher-search">
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>
            <input id="quickSwitcherInput" type="search" placeholder="Search reports and SOPs" autocomplete="off" aria-label="Search reports and SOPs" aria-controls="quickSwitcherResults">
            <kbd>ESC</kbd>
          </div>
          <div class="quick-switcher-results" id="quickSwitcherResults" role="listbox" aria-label="Pages"></div>
          <div class="quick-switcher-footer"><span>Navigate <kbd>↑</kbd><kbd>↓</kbd></span><span>Open <kbd>Enter</kbd></span><span>Close <kbd>Esc</kbd></span></div>
        </div>
      </dialog>
      <aside class="page-drawer" id="pageDrawer" aria-label="Site menu">
        <div class="drawer-header">
          <a class="drawer-brand" href="${homeUrl}"><img src="${logoUrl}" alt="" width="34" height="34"><span>Newcastle Aikido</span></a>
          <button class="drawer-close" type="button" aria-label="Close menu">×</button>
        </div>
        <nav class="drawer-nav" aria-label="Pages">
          <a href="${homeUrl}" title="Home"${isHere(homeUrl) ? ' class="active" aria-current="page"' : ''}>${icon('home')}<span>Home</span></a>
          ${groups}
        </nav>
        <section class="drawer-today" aria-label="Today">
          <p class="drawer-today-date">${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <button type="button" class="drawer-today-row" id="drawerTasks">
            <span>My tasks today</span><strong data-today="tasks">–</strong>
            <span class="drawer-today-bar" aria-hidden="true"><span></span></span>
          </button>
          <button type="button" class="drawer-today-row" id="drawerAlerts"><span>Unread alerts</span><strong data-today="alerts">–</strong></button>
          <a class="drawer-today-row" id="drawerPastDue" href="${getMenuUrl('pages/REPORTs/PastDueMembers.html')}" hidden><span>Past Due follow-ups</span><strong data-today="pastdue"></strong></a>
        </section>
        <section class="drawer-recent" id="drawerRecent" aria-labelledby="drawerRecentTitle" hidden>
          <h3 id="drawerRecentTitle">Recent</h3>
          <div class="drawer-recent-list"></div>
        </section>
        <div class="drawer-footer">
          <a class="drawer-settings${isHere(settingsUrl) ? ' active' : ''}" href="${settingsUrl}" aria-label="Settings">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span class="drawer-settings-label">Settings</span>
          </a>
          <button type="button" class="drawer-collapse" id="menuCollapse" aria-pressed="false" aria-label="Collapse menu to icons" title="Collapse menu (M)">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M16 10l-2 2 2 2"/></svg>
          </button>
        </div>
      </aside>
      <div class="drawer-overlay" id="pageOverlay"></div>
    `);
  }

  function initSiteMenu() {
    buildMenu();

    const menuToggle = document.getElementById('menuToggle');
    const drawer = document.getElementById('pageDrawer');
    const overlay = document.getElementById('pageOverlay');
    const closeBtn = drawer.querySelector('.drawer-close');
    // Wide screens: the sidebar is always open. Narrow screens: it slides out from the menu button.
    const wide = window.matchMedia('(min-width: 1100px)');

    const toggleDrawer = open => {
      drawer.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
      drawer.inert = !open && !wide.matches;
      menuToggle?.setAttribute('aria-expanded', String(open));
    };
    toggleDrawer(false);
    wide.addEventListener('change', () => toggleDrawer(false));

    menuToggle?.addEventListener('click', () => toggleDrawer(true));
    overlay.addEventListener('click', () => toggleDrawer(false));
    closeBtn.addEventListener('click', () => toggleDrawer(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawer.classList.contains('open')) toggleDrawer(false);
    });

    drawer.querySelectorAll('.drawer-group-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.closest('.drawer-group');
        const expanded = group.classList.toggle('expanded');
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        saveOpen([...drawer.querySelectorAll('.drawer-group.expanded')].map(item => item.dataset.group));
      });
    });

    initCollapse();
    initToday();
    initRecent();
    initQuickSwitcher();
    initShortcuts();

    initUnfinishedFeatureNotice();
  }

  // Sidebar "Today" card: tasks done (js/tasks.js), unread alerts (js/notifications.js) and Past Due
  // follow-ups due (js/tasks.js, only once a task that opens Past Due has loaded them).
  function initToday() {
    const value = name => document.querySelector(`[data-today="${name}"]`);
    window.addEventListener('portal-tasks', ({ detail }) => {
      value('tasks').textContent = detail.total ? `${detail.done} / ${detail.total}` : 'None';
      document.querySelector('.drawer-today-bar span').style.width = `${detail.total ? (detail.done / detail.total) * 100 : 0}%`;
    });
    window.addEventListener('portal-unread', ({ detail }) => {
      value('alerts').textContent = detail;
      value('alerts').classList.toggle('is-attention', detail > 0);
    });
    window.addEventListener('portal-pastdue', ({ detail }) => {
      document.getElementById('drawerPastDue').hidden = !detail;
      value('pastdue').textContent = detail;
    });
    document.getElementById('drawerTasks').addEventListener('click', () => {
      if (document.getElementById('taskTab')) window.portalTasks?.toggle();
      else window.location.href = getMenuUrl('pages/Tasks.html');
    });
    // Stop the click here, or the page's "click outside closes the bell" would shut it again.
    document.getElementById('drawerAlerts').addEventListener('click', event => {
      event.stopPropagation();
      document.getElementById('notifyBtn')?.click();
    });
  }

  // Sidebar "Recent": the last pages opened from the menu, newest first (this browser only).
  const RECENT_KEY = 'portal-recent-pages';
  function initRecent() {
    const pages = [{ label: 'Tasks', url: getMenuUrl('pages/Tasks.html') }, ...getNavigationItems()];
    const current = pages.find(page => isHere(page.url.split('#')[0]));
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch {}
    recent = recent.filter(url => pages.some(page => page.url === url));
    if (current) {
      recent = [current.url, ...recent.filter(url => url !== current.url)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    }
    const shown = recent.filter(url => url !== current?.url).slice(0, 4);
    const box = document.getElementById('drawerRecent');
    box.hidden = !shown.length;
    box.querySelector('.drawer-recent-list').innerHTML = shown.map(url => {
      const page = pages.find(item => item.url === url);
      return `<a href="${url}" title="${page.label}">${page.label}</a>`;
    }).join('');
  }

  // Wide screens: the sidebar can shrink to icons only (remembered in this browser).
  const COLLAPSE_KEY = 'portal-menu-collapsed';
  function initCollapse() {
    const button = document.getElementById('menuCollapse');
    const set = collapsed => {
      document.documentElement.classList.toggle('menu-collapsed', collapsed);
      button.setAttribute('aria-pressed', String(collapsed));
      button.setAttribute('aria-label', collapsed ? 'Expand menu' : 'Collapse menu to icons');
      button.title = collapsed ? 'Expand menu (M)' : 'Collapse menu (M)';
      try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : ''); } catch {}
    };
    let stored = '';
    try { stored = localStorage.getItem(COLLAPSE_KEY); } catch {}
    set(Boolean(stored));
    button.addEventListener('click', () => set(!document.documentElement.classList.contains('menu-collapsed')));
  }

  // Single-key shortcuts, ignored while typing or with a box open. Ctrl+K is in initQuickSwitcher.
  const SHORTCUTS = [
    ['T', 'Open or close today\'s tasks'],
    ['N', 'Add a task'],
    ['M', 'Collapse or expand the menu (menu on phones)'],
    ['/', 'Find a page'],
    ['?', 'Show these shortcuts']
  ];
  function initShortcuts() {
    const rows = [['Ctrl K', 'Find a page'], ...SHORTCUTS].map(([key, what]) => `<div><dt><kbd>${key}</kbd></dt><dd>${what}</dd></div>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="fu-dialog shortcut-dialog" id="shortcutDialog" aria-labelledby="shortcutTitle">
        <form method="dialog">
          <h2 id="shortcutTitle">Keyboard shortcuts</h2>
          <dl class="shortcut-list">${rows}</dl>
          <div class="fu-dialog-actions"><button class="sop-action-button primary">Close</button></div>
        </form>
      </dialog>`);
    const dialog = document.getElementById('shortcutDialog');
    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      const run = {
        t: () => window.portalTasks?.toggle(),
        n: () => window.portalTasks?.add(),
        m: () => window.matchMedia('(min-width: 1100px)').matches ? document.getElementById('menuCollapse').click() : document.getElementById('menuToggle')?.click(),
        '/': () => document.getElementById('quickSwitcherTrigger')?.click(),
        '?': () => dialog.showModal()
      }[key];
      if (!run) return;
      event.preventDefault();
      run();
    });
  }

  function initQuickSwitcher() {
    const dialog = document.getElementById('quickSwitcher');
    const trigger = document.getElementById('quickSwitcherTrigger');
    const input = document.getElementById('quickSwitcherInput');
    const results = document.getElementById('quickSwitcherResults');
    if (!dialog || !trigger || !input || !results) return;

    let activeIndex = 0;
    const items = getNavigationItems();

    function openSwitcher() {
      input.value = '';
      renderResults();
      dialog.showModal();
      input.focus();
    }

    function renderResults() {
      const query = input.value.trim().toLowerCase();
      // Pages the user's role can't open are left out (js/access.js).
      const matches = items.filter(item => `${item.label} ${item.category}`.toLowerCase().includes(query)
        && (!window.portalAllowsUrl || window.portalAllowsUrl(item.url)));
      activeIndex = 0;
      results.replaceChildren();

      if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'quick-switcher-empty';
        empty.textContent = 'No matching pages';
        results.append(empty);
        return;
      }

      matches.forEach((item, index) => {
        const option = document.createElement('button');
        option.className = 'quick-switcher-result';
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === activeIndex));
        option.style.setProperty('--result-index', index);

        const label = document.createElement('span');
        label.className = 'quick-switcher-result-label';
        label.textContent = item.label;

        const category = document.createElement('span');
        category.className = 'quick-switcher-result-category';
        category.textContent = item.category;

        option.append(label, category);
        option.addEventListener('click', () => { window.location.href = item.url; });
        results.append(option);
      });
    }

    function moveSelection(direction) {
      const options = [...results.querySelectorAll('.quick-switcher-result')];
      if (!options.length) return;
      activeIndex = (activeIndex + direction + options.length) % options.length;
      options.forEach((option, index) => {
        option.setAttribute('aria-selected', String(index === activeIndex));
      });
      options[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function openSelection() {
      results.querySelector('.quick-switcher-result[aria-selected="true"]')?.click();
    }

    trigger.addEventListener('click', openSwitcher);
    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        openSelection();
      }
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dialog.open) {
        event.preventDefault();
        dialog.close();
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => trigger.focus());
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!dialog.open) openSwitcher();
      }
    });
  }

  function initUnfinishedFeatureNotice() {
    const notice = document.createElement('div');
    notice.className = 'feature-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.appendChild(notice);

    let hideTimer;
    document.querySelectorAll('[data-feature-status="unfinished"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
          const buttonGroup = button.parentElement;
          if (buttonGroup) {
            buttonGroup.querySelectorAll('button').forEach(item => {
              item.classList.remove('active');
              item.removeAttribute('aria-current');
            });
          }
          button.classList.add('active');
          button.setAttribute('aria-current', 'page');
        notice.textContent = "Sorry, this feature isn't finished yet. Please check back in a bit! ☹️";
        notice.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => notice.classList.remove('visible'), 3000);
      });
    });
  }

  initSiteMenu();
})();
