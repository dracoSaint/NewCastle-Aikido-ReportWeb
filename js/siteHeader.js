(function () {
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const homeUrl = new URL('index.html', siteRoot).href;
  const logoUrl = new URL('imgs/aikido-logo.png', siteRoot).href;

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

    header.insertAdjacentHTML('afterbegin', `
      <div class="site-brand" id="siteBrand">
        <button id="menuToggle" class="menu-toggle" aria-label="Open site menu">☰</button>
        <a href="${homeUrl}" aria-label="Newcastle Aikido home">
          <img class="site-logo" src="${logoUrl}" alt="Newcastle Aikido logo">
        </a>
        <h1>Newcastle Aikido</h1>
      </div>
    `);
  }

  initSiteIcon();
  initSiteHeader();
})();
