(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const homeUrl = new URL('index.html', siteRoot).href;

  const menuGroups = [
    {
      id: 'reportMenu',
      label: 'REPORTS',
      items: [
        { 
            label: 'Grading Report',
            path: 'pages/REPORTs/GradingReport.html'
        },
        { 
            label: 'Monday Board Report', 
            path: 'pages/REPORTs/MondayBoardReport.html'
        },
        { 
            label: 'Attendance Report',
            path: 'pages/REPORTs/AttendanceReport.html'
        },
        {
          label: 'Past Due Members',
          path: 'pages/REPORTs/PastDueMembers.html'
        }
      ]
    },
    {
    id: 'sopMenu',
    label: 'SOP',
    items: [
        {
            label: 'Billing & Payments',
            path: 'pages/SOPs/SOPDocuments.html?sop=billing-account-query'
        },
        {
            label: 'Membership',
            path: 'pages/SOPs/SOPDocuments.html?sop=membership-adjust-start-date'
        },
        {
            label: 'Contacts & CRM',
            path: 'pages/SOPs/SOPDocuments.html?sop=contacts-merge-duplicates'
        },
        {
            label: 'Invoicing',
            path: 'pages/SOPs/SOPDocuments.html?sop=invoicing-engage-gen'
        },
        {
            label: 'Enquiries & Leads',
            path: 'pages/SOPs/SOPDocuments.html?sop=enquiries-emails-jr'
        },
        {
            label: 'Email & Inbox Admin',
            path: 'pages/SOPs/SOPDocuments.html?sop=email-action-saving'
        },
        {
            label: 'Grading & Attendance',
            path: 'pages/SOPs/SOPDocuments.html?sop=grading-member-hour-report'
        },
        {
            label: 'Phones',
            path: 'pages/SOPs/SOPDocuments.html?sop=phones-diverting-calls'
        }
    ]
    }
    /*
    //COPY PASTE THIS TO ADD ANOTHER DROP DOWN MENU
    {
    id: 'trainingMenu',
    label: 'TRAINING',
    items: [
        {
        label: 'Training Schedule',
        path: 'pages/Training/TrainingSchedule.html'
        },
        {
        label: 'Training Resources',
        path: 'pages/Training/Resources.html'
        }
    ]
    }
    */
  ];

  function getMenuUrl(path) {
    return new URL(path, siteRoot).href;
  }

  function getNavigationItems() {
    return [
      { label: 'Home', category: 'Workspace', url: homeUrl },
      ...menuGroups.flatMap(group => group.items.map(item => ({
        label: item.label,
        category: group.label === 'REPORTS' ? 'Report' : 'SOP',
        url: getMenuUrl(item.path)
      })))
    ];
  }

  function groupHasActiveItem(group) {
    return group.items.some(item => getMenuUrl(item.path).toLowerCase() === window.location.href.toLowerCase());
  }

  function renderMenuGroup(group) {
    const expanded = groupHasActiveItem(group);
    const items = group.items.map(item => {
      const itemUrl = getMenuUrl(item.path);
      const activeClass = itemUrl.toLowerCase() === window.location.href.toLowerCase() ? ' class="active"' : '';
      return `<a href="${itemUrl}"${activeClass}>${item.label}</a>`;
    }).join('');

    return `
      <div class="drawer-group${expanded ? ' expanded' : ''}">
        <button class="drawer-group-toggle" type="button" aria-expanded="${expanded}" aria-controls="${group.id}">
          <span>${group.label}</span>
          <span class="drawer-chevron" aria-hidden="true"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="drawer-submenu" id="${group.id}">${items}</div>
      </div>`;
  }

  function buildMenu() {
    const homeClass = homeUrl.toLowerCase() === window.location.href.toLowerCase() ? ' class="active"' : '';
    const groups = menuGroups.map(renderMenuGroup).join('');
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
      <div class="page-drawer" id="pageDrawer" aria-hidden="true">
        <div class="drawer-header">
          <strong>Pages</strong>
          <button class="drawer-close" type="button" aria-label="Close menu">×</button>
        </div>
        <nav class="drawer-nav">
          <a href="${homeUrl}"${homeClass}>Home</a>
          ${groups}
        </nav>
      </div>
      <div class="drawer-overlay" id="pageOverlay"></div>
    `);
  }

  function initSiteMenu() {
    buildMenu();

    const menuToggle = document.getElementById('menuToggle');
    const drawer = document.getElementById('pageDrawer');
    const overlay = document.getElementById('pageOverlay');
    const closeBtn = drawer.querySelector('.drawer-close');

    const toggleDrawer = open => {
      drawer.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    menuToggle.addEventListener('click', () => toggleDrawer(true));
    overlay.addEventListener('click', () => toggleDrawer(false));
    closeBtn.addEventListener('click', () => toggleDrawer(false));

    drawer.querySelectorAll('.drawer-group-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.closest('.drawer-group');
        const expanded = group.classList.toggle('expanded');
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
    });

    initQuickSwitcher();

    initUnfinishedFeatureNotice();
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
      const matches = items.filter(item => `${item.label} ${item.category}`.toLowerCase().includes(query));
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
