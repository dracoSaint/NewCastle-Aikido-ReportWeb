(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot  = new URL('../', scriptUrl);
  const homeUrl    = new URL('index.html',    siteRoot).href;
  const profileUrl = new URL('profile.html',  siteRoot).href;
  const logoUrl    = new URL('imgs/aikido-logo.png', siteRoot).href;

  function initSiteIcon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const icon = document.createElement('link');
    icon.rel   = 'icon';
    icon.type  = 'image/png';
    icon.href  = logoUrl;
    document.head.appendChild(icon);
  }

  function initSiteHeader() {
    const header = document.querySelector('header');
    if (!header || document.getElementById('siteBrand')) return;

    const projectRef   = 'knnzybqudpdxhddcaxcv';
    const tokenKey     = `sb-${projectRef}-auth-token`;
    const isLoggedIn   = localStorage.getItem(tokenKey);

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
            <span class="dropdown-item-icon">👤</span> Update profile
          </a>
          <button id="logoutBtn" class="profile-dropdown-item profile-dropdown-logout" role="menuitem">
            <span class="dropdown-item-icon">↩</span> Logout
          </button>
        </div>
      </div>` : '';

    header.insertAdjacentHTML('afterbegin', `
      <div class="site-brand" id="siteBrand">
        <button id="menuToggle" class="menu-toggle" aria-label="Open site menu">☰</button>
        <a href="${homeUrl}" aria-label="Newcastle Aikido home">
          <img class="site-logo" src="${logoUrl}" alt="Newcastle Aikido logo">
        </a>
        <h1>Newcastle Aikido</h1>
        ${profileDropdownHtml}
      </div>
    `);

    if (isLoggedIn) {
      initDropdownBehaviour();
      populateAvatarAsync();
    }
  }

  // ── Toggle open / close ───────────────────────────────────────────────────
  function initDropdownBehaviour() {
    const btn  = document.getElementById('profileAvatarBtn');
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

        const user      = session.user;
        const fullName  = user.user_metadata?.full_name || '';
        const email     = user.email || '';
        const initial   = (fullName || email).charAt(0).toUpperCase();

        const avatarEl = document.getElementById('profileAvatarInitial');
        const nameEl   = document.getElementById('dropdownName');
        const emailEl  = document.getElementById('dropdownEmail');

        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl)   nameEl.textContent   = fullName || 'No name set';
        if (emailEl)  emailEl.textContent  = email;
      }).catch(console.error);
    }
    tryPopulate();
  }

  initSiteIcon();
  initSiteHeader();
})();
