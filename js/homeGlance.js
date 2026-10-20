// Home "At a glance" tiles (index.html): live numbers from the reports, each linking to its report.
// Tiles for reports the role can't view are hidden (data-requires, js/access.js) and never queried.
// Uses followUpCore.js (fuBuild) and pastDueCore.js (pastDueIdentity), loaded before this file.
(async function () {
  const set = (name, value, sub) => {
    const tile = document.querySelector(`[data-glance="${name}"]`);
    if (!tile) return;
    tile.querySelector('strong').textContent = value;
    tile.querySelector('small').textContent = sub || '';
  };
  const money = value => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

  // Today's tasks: js/tasks.js sends the count whenever its list changes.
  window.addEventListener('portal-tasks', ({ detail }) => set('tasks', detail.total ? `${detail.done} / ${detail.total}` : '0', detail.total ? (detail.done === detail.total ? 'All done today' : `${detail.total - detail.done} still to do`) : 'Nothing due today'));

  await window.authReady;
  const access = await window.portalAccess;
  const can = permission => !access || access.can(permission);
  const client = window.supabaseClient;
  if (!client) return;

  const jobs = [];
  if (can('monday.view')) jobs.push(client.from('membership_weekly_log').select('report_date, members_total').order('report_date', { ascending: false }).limit(2).then(({ data }) => {
    if (!data?.length) return set('members', '—', 'No weekly count yet');
    const [now, before] = data;
    const change = before ? now.members_total - before.members_total : 0;
    set('members', String(now.members_total), before ? `${change > 0 ? '+' : ''}${change} vs last week` : '');
  }));

  if (can('followup.view')) jobs.push(Promise.all([
    client.from('follow_up_reports').select('*').order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    client.from('app_settings').select('value').eq('key', 'followup_tiers').maybeSingle() // Settings > Report rules
  ]).then(([{ data }, tiers]) => {
    if (!data?.length) return set('followup', '—', 'No report yet');
    fuApplyTiers(tiers.data?.value);
    const result = fuBuild(data[0]);
    // Same people as the report's To follow up count: orange, red and no attendance record.
    set('followup', String(result.orange.length + result.red.length + result.none.length), `${result.orange.length} orange · ${result.red.length} red · ${result.none.length} no record`);
  }));

  // Same rule as the Past Due page: exempt members left out, a member is owing while any bill is PAST DUE.
  if (can('pastdue.view')) jobs.push(Promise.all([
    client.from('past_due_member_log').select('member_key, member_number, member_name, amount, status'),
    client.from('past_due_exempted_members').select('member_key, member_number, member_name')
  ]).then(([log, exempt]) => {
    if (log.error) return set('pastdue', '—', '');
    const keys = new Set((exempt.data || []).flatMap(item => [item.member_key, item.member_number, item.member_name].map(pastDueIdentity).filter(Boolean)));
    const members = new Map();
    log.data.filter(row => ![row.member_key, row.member_number, row.member_name].map(pastDueIdentity).some(key => key && keys.has(key))).forEach(row => {
      const key = pastDueIdentity(row.member_name) || row.member_key;
      if (!members.has(key)) members.set(key, []);
      members.get(key).push(row);
    });
    const owing = [...members.values()].map(bills => bills.filter(bill => bill.status === 'PAST DUE')).filter(bills => bills.length);
    const total = owing.flat().reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
    set('pastdue', money(total), `${owing.length} ${owing.length === 1 ? 'member' : 'members'} owing`);
  }));

  await Promise.allSettled(jobs);
})();
