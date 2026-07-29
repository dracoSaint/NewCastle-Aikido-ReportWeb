(function () {
  function initSiteFooter() {
    const footer = document.querySelector('footer');
    if (!footer) return;

    const pageTitle = document.title;
    let footerText = 'Newcastle Aikido';

    if (pageTitle.startsWith('Newcastle Aikido - ')) {
      footerText = pageTitle;
    }

    footer.textContent = footerText;
  }
  initSiteFooter();

})();