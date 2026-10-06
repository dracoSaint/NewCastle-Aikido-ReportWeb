(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const homeUrl = new URL('index.html', siteRoot).href;
  const profileUrl = new URL('pages/profile.html', siteRoot).href;
  const logoUrl = new URL('imgs/aikido-logo.png', siteRoot).href;
  const logoWhiteUrl = new URL('imgs/aikido-logo-white.png', siteRoot).href; // brand: white mark on the dark shell

  function initSiteIcon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/png';
    icon.href = logoUrl;
    document.head.appendChild(icon);
  }

  function initSiteHeader() {
    const header = document.querySelector('header');
    if (!header || document.getElementById('siteBrand')) return;

    const projectRef = 'knnzybqudpdxhddcaxcv';
    const tokenKey = `sb-${projectRef}-auth-token`;
    const isLoggedIn = localStorage.getItem(tokenKey);

    // Profile dropdown — only render when authenticated
    const profileDropdownHtml = isLoggedIn ? `
      <div class="profile-dropdown-wrap" id="profileDropdownWrap">
        <button class="profile-avatar-btn" id="profileAvatarBtn" aria-haspopup="true" aria-expanded="false" aria-label="Open profile menu">
          <span class="profile-avatar-initial" id="profileAvatarInitial">…</span>
        </button>
        <div class="profile-dropdown-menu" id="profileDropdownMenu" role="menu" hidden>
          <div class="profile-dropdown-info" id="profileDropdownInfo">
            <span class="dropdown-info-name"  id="dropdownName">Loading…</span>
            <span class="dropdown-info-email" id="dropdownEmail"></span>
          </div>
          <hr class="profile-dropdown-divider">
          <a href="${profileUrl}" class="profile-dropdown-item" role="menuitem">
            <svg class="dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Update profile
          </a>
          <button id="logoutBtn" class="profile-dropdown-item profile-dropdown-logout" role="menuitem">
            <svg class="dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </div>` : '';

    header.insertAdjacentHTML('afterbegin', `
      <div class="site-brand" id="siteBrand">
        <button id="menuToggle" class="menu-toggle" aria-label="Open site menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <a class="site-home" href="${homeUrl}" aria-label="Newcastle Aikido home">
          <img class="site-logo" src="${logoWhiteUrl}" alt="">
          <span class="site-name">Newcastle Aikido</span>
        </a>
        ${profileDropdownHtml}
      </div>
    `);

    initPageHead(header);

    if (isLoggedIn) {
      initDropdownBehaviour();
      populateAvatarAsync();
    }
  }

  // ── Page title row: every page gets the same title / meta / actions layout ──
  function initPageHead(header) {
    const title = header.dataset.title || document.title
      .replace(/\s*-\s*Newcastle Aikido( Portal)?\s*$/i, '')
      .replace(/^Newcastle Aikido\s*-\s*/i, '');

    const head = document.createElement('div');
    head.className = 'page-head';
    const text = document.createElement('div');
    text.className = 'page-head-text';
    const h1 = document.createElement('h1');
    h1.className = 'page-title';
    h1.textContent = title;
    text.append(h1);

    const meta = header.querySelector(':scope > p');
    if (meta) {
      meta.classList.add('page-meta');
      text.append(meta);
    }
    head.append(text);

    const controls = header.querySelectorAll(':scope > button, :scope > input');
    if (controls.length) {
      const actions = document.createElement('div');
      actions.className = 'page-actions';
      actions.append(...controls);
      head.append(actions);
    }

    header.insertBefore(head, header.querySelector(':scope > nav'));
  }

  // ── Toggle open / close ───────────────────────────────────────────────────
  function initDropdownBehaviour() {
    const btn = document.getElementById('profileAvatarBtn');
    const menu = document.getElementById('profileDropdownMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close when clicking anywhere outside
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Prevent clicks inside the menu from closing it immediately
    menu.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Populate avatar initials + name / email from Supabase session ─────────
  function populateAvatarAsync() {
    function tryPopulate() {
      if (!window.supabaseClient) { setTimeout(tryPopulate, 80); return; }

      window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user) return;

        const user = session.user;
        const fullName = user.user_metadata?.full_name || '';
        const email = user.email || '';
        const initial = (fullName || email).charAt(0).toUpperCase();

        const avatarEl = document.getElementById('profileAvatarInitial');
        const nameEl = document.getElementById('dropdownName');
        const emailEl = document.getElementById('dropdownEmail');

        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl) nameEl.textContent = fullName || 'No name set';
        if (emailEl) emailEl.textContent = email;
      }).catch(console.error);
    }
    tryPopulate();
  }

  initSiteIcon();
  initSiteHeader();
})();
