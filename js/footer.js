(function () {
  function initSiteFooter() {
    const footer = document.querySelector('footer');
    if (!footer) return;

    const pageTitle = document.title;
    let footerText = 'Newcastle Aikido';

    if (pageTitle.startsWith('Newcastle Aikido - ')) {
      footerText = pageTitle; // Use the full title if it's a specific report/page
    }

    footer.textContent = footerText;
  }
  initSiteFooter();
})();