// What the signed-in user's role may see and do (Settings > Roles). The database enforces the same
// switches (supabase/access_control.sql); this file only hides what would be refused anyway.
//
// Mark anything that needs a switch with data-requires="pastdue.edit" (several = all needed).
// Pages and their links are hidden by file name below. Loaded by js/auth.js on every page.

const ACCESS_PERMISSIONS = [
  { group: 'Monday Board Report', items: [['monday.view', 'View'], ['monday.edit', 'Upload, history log, pricing']] },
  { group: 'Past Due Members', items: [['pastdue.view', 'View'], ['pastdue.edit', 'Notes, bills, imports, exemptions']] },
  { group: 'Red / Orange Follow-Up', items: [['followup.view', 'View'], ['followup.edit', 'Log contacts, notes, uploads']] },
  { group: 'Daily Ad Review', items: [['ads.view', 'View'], ['ads.edit', 'Imports, actions, playbook']] },
  { group: 'Grading Report', items: [['grading.view', 'View']] },
  { group: 'SOPs', items: [['sops.view', 'View'], ['sops.edit', 'Add, edit, delete SOPs']] },
  { group: 'Bots', items: [['sync.run', 'Press Sync buttons'], ['bots.manage', 'Bot schedules and report rules']] },
  { group: 'Admin', items: [['access.manage', 'Users, roles and permissions'], ['audit.view', 'View the audit log']] },
  { group: 'System', items: [['bots.schedule', 'Scheduler: starts bots on time (bot account only)']] }
];

// Page file name -> its permission area ("monday" -> monday.view / monday.edit).
const ACCESS_PAGES = {
  'MondayBoardReport.html': 'monday',
  'PastDueMembers.html': 'pastdue',
  'FollowUpReport.html': 'followup',
  'DailyAdReview.html': 'ads',
  'GradingReport.html': 'grading',
  'SOPDocuments.html': 'sops'
};

(function () {
  if (!window.authReady) return;

  window.portalAccess = window.authReady.then(async () => {
    const client = window.supabaseClient;
    if (!client) return null;
    const { data, error } = await client.rpc('my_access');
    // Before supabase/access_control.sql has been run there are no roles: keep today's open access.
    if (error || !data) {
      if (error) console.warn('Roles not set up yet:', error.message);
      return null;
    }

    const can = permission => data.is_dev || data.permissions.includes(permission);
    const denied = ACCESS_PERMISSIONS.flatMap(group => group.items.map(([key]) => key)).filter(key => !can(key));

    const rules = denied.map(key => `[data-requires~="${key}"]`);
    Object.entries(ACCESS_PAGES).forEach(([file, area]) => {
      if (!can(`${area}.view`)) rules.push(`a[href*="${file}"]`, `li:has(> a[href*="${file}"])`);
    });
    if (rules.length) {
      const style = document.createElement('style');
      style.textContent = `${rules.join(',\n')} { display: none !important; }`;
      document.head.append(style);
    }
    document.documentElement.dataset.deny = denied.join(' ');
    // For lists built in code (the Ctrl+K quick switcher): may this role open that page?
    window.portalAllowsUrl = url => {
      const file = Object.keys(ACCESS_PAGES).find(name => String(url).includes(name));
      return !file || can(`${ACCESS_PAGES[file]}.view`);
    };

    // A page the role can't view: say so instead of showing an empty report.
    const file = Object.keys(ACCESS_PAGES).find(name => window.location.pathname.endsWith(name));
    if (file && !can(`${ACCESS_PAGES[file]}.view`)) {
      const show = () => {
        const main = document.querySelector('main');
        if (main) main.innerHTML = '<div class="card access-denied"><h2>No access</h2><p>Your role can\'t open this page. Ask the dev to switch it on in Settings &gt; Roles.</p></div>';
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
      else show();
    }

    return { ...data, can };
  }).catch(error => {
    console.warn('Could not load role permissions:', error);
    return null;
  });
})();

if (typeof module !== 'undefined') module.exports = { ACCESS_PERMISSIONS, ACCESS_PAGES };
