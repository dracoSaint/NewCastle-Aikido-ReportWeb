(function () {
  function initSiteFooter() {
    const footer = document.querySelector('footer');
    if (!footer) return;

    // Prefer the page title the header shows; fall back to the document title.
    const pageTitle = document.querySelector('.page-title')?.textContent.trim() ||
      document.title.replace(/^Newcastle Aikido\s*-\s*/i, '').replace(/\s*-\s*Newcastle Aikido.*$/i, '');

    footer.textContent = pageTitle && pageTitle !== 'Newcastle Aikido'
      ? `Newcastle Aikido - ${pageTitle}`
      : 'Newcastle Aikido';
  }
  initSiteFooter();

})();
