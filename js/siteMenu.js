(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const homeUrl = new URL('index.html', siteRoot).href;

  const menuGroups = [
    {
      id: 'reportMenu',
      label: 'REPORT',
      items: [
        { label: 'Grading Report', path: 'pages/REPORTs/GradingReport.html' },
        { label: 'Monday Board Report', path: 'pages/REPORTs/MondayBoardReport.html' }
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
          ${group.label} <span aria-hidden="true">▾</span>
        </button>
        <div class="drawer-submenu" id="${group.id}">${items}</div>
      </div>`;
  }

  function buildMenu() {
    const homeClass = homeUrl.toLowerCase() === window.location.href.toLowerCase() ? ' class="active"' : '';
    const groups = menuGroups.map(renderMenuGroup).join('');

    document.body.insertAdjacentHTML('beforeend', `
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

    initUnfinishedFeatureNotice();
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
        notice.textContent = "Sorry, this feature isn't finished yet. Please check back in a bit! ☹️";
        notice.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => notice.classList.remove('visible'), 3000);
      });
    });
  }

  initSiteMenu();
})();
