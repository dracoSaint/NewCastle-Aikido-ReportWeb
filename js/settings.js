// Settings page: bot schedules (bot_settings), report rules (app_settings), roles and their permission
// switches (app_roles, app_role_permissions) and each user's role (app_user_roles).
// Tables and the rules that guard them: supabase/access_control.sql. Catalog: js/access.js.

const SETTINGS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SETTINGS_BOTS = {
  followup: 'Saves the nightly Red / Orange Follow-Up report.',
  pastdue: 'Adds new unpaid bills to Past Due and clears paid ones.',
  monday: 'Imports the membership report into the Monday report.'
};

// Preferences > Start page: Home, or a page the role can open (js/auth.js only accepts pages/....html).
const SETTINGS_START_PAGES = [
  ['', 'Home', null],
  ['pages/REPORTs/MondayBoardReport.html', 'Monday Board Report', 'monday'],
  ['pages/REPORTs/PastDueMembers.html', 'Past Due Members', 'pastdue'],
  ['pages/REPORTs/FollowUpReport.html', 'Red / Orange Follow-Up', 'followup'],
  ['pages/REPORTs/DailyAdReview.html', 'Daily Ad Review', 'ads'],
  ['pages/REPORTs/GeronimoMetrics.html', 'Geronimo Metrics Report', 'geronimo'],
  ['pages/REPORTs/GradingReport.html', 'Grading Report', 'grading'],
  ['pages/SOPs/SOPDocuments.html', 'SOPs', 'sops']
];

// System status: where each source's latest data is, and how old it may get before it's "behind".
const SETTINGS_SOURCES = [
  {
    label: 'Past due sync', bot: 'pastdue', area: 'pastdue', maxHours: 36,
    load: client => client.from('past_due_import_runs').select('ran_at, source, bills_added, bills_cleared').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
    at: row => row.ran_at,
    detail: row => `${row.source === 'csv' ? 'CSV import' : 'Zen Planner'} · ${row.bills_added} added, ${row.bills_cleared} cleared`
  },
  {
    label: 'Red / Orange follow-up', bot: 'followup', area: 'followup', maxHours: 36,
    load: client => client.from('follow_up_reports').select('created_at, report_date').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    at: row => row.created_at,
    detail: row => `Report for ${settingsDay(row.report_date)}`
  },
  {
    label: 'Monday report', bot: 'monday', area: 'monday', maxHours: 8 * 24,
    load: client => client.from('membership_weekly_log').select('uploaded_at, report_date, members_total').order('uploaded_at', { ascending: false }).limit(1).maybeSingle(),
    at: row => row.uploaded_at,
    detail: row => `Week of ${settingsDay(row.report_date)} · ${row.members_total} members`
  },
  {
    label: 'Daily Ad Review import', bot: null, area: 'ads', maxHours: 72,
    load: client => client.from('ad_review_snapshots').select('report_date').order('report_date', { ascending: false }).limit(1).maybeSingle(),
    at: row => `${row.report_date}T12:00:00`,
    detail: row => `Latest Meta report ${settingsDay(row.report_date)} (imported by hand)`
  }
];

let settingsAccess = null;
let settingsUser = null;
let settingsBotRows = [];
let settingsEmail = '';
let settingsRoles = [];
let settingsUsers = [];
const settingsSwitches = new Map(); // role key -> Set of permissions
let settingsRole = null;            // role shown in the switch editor
let settingsDirty = false;

const settingsEl = id => document.getElementById(id);
const settingsEsc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
const settingsDay = iso => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

// "Next run Thu 16 Oct, 4:30 am" from a bot's days and time (this browser's clock, i.e. Newcastle).
function settingsNextRun({ enabled, run_days: days, run_time: time }) {
  if (!enabled) return 'Off: no scheduled runs and no Sync button';
  if (!days?.length || !time) return 'No days picked';
  const [hour, minute] = String(time).split(':').map(Number);
  const now = new Date();
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const run = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour, minute);
    if (run > now && days.includes(run.getDay())) {
      return `Next run ${run.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
    }
  }
  return 'No upcoming run';
}

const settingsWhen = value => (value ? new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

async function settingsClient() {
  await window.authReady;
  if (!window.supabaseClient) throw new Error('Your session has ended. Please sign in again.');
  return window.supabaseClient;
}

function settingsToast(message, isError = false) {
  const toast = settingsEl('settingsToast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(settingsToast.timer);
  settingsToast.timer = setTimeout(() => { toast.hidden = true; }, isError ? 6000 : 2500);
}

async function settingsRun(action, success) {
  try {
    await action();
    if (success) settingsToast(success);
  } catch (error) {
    console.error(error);
    settingsToast(error.message || 'Something went wrong. Nothing was saved.', true);
  }
}

// ── Bots ─────────────────────────────────────────────────────────────────────

async function settingsLoadBots() {
  const client = await settingsClient();
  const { data, error } = await client.from('bot_settings').select('*');
  if (error) throw error;
  const order = Object.keys(SETTINGS_BOTS);
  const bots = data.sort((a, b) => order.indexOf(a.job) - order.indexOf(b.job));
  settingsBotRows = bots;
  settingsEl('botList').innerHTML = bots.map(bot => `
    <form class="card settings-bot" data-job="${settingsEsc(bot.job)}">
      <div class="card-heading-row">
        <h2>${settingsEsc(bot.label)}</h2>
        <label class="settings-switch"><input type="checkbox" role="switch" name="enabled"${bot.enabled ? ' checked' : ''}><span data-switch-label>${bot.enabled ? 'On' : 'Off'}</span></label>
      </div>
      <div class="settings-bot-body">
        <p class="page-lede">${settingsEsc(SETTINGS_BOTS[bot.job] || '')}</p>
        <p class="settings-next" data-next-run>${settingsEsc(settingsNextRun(bot))}</p>
        ${bot.last_started_at ? `<p class="settings-status">Last started ${settingsEsc(settingsWhen(bot.last_started_at))} by ${settingsEsc(bot.last_started_by || 'scheduler')}</p>` : ''}
        <fieldset class="settings-days">
          <legend>Days</legend>
          ${SETTINGS_DAYS.map((day, index) => `<label><input type="checkbox" name="day" value="${index}"${bot.run_days.includes(index) ? ' checked' : ''}><span>${day}</span></label>`).join('')}
        </fieldset>
        <div class="settings-fields">
          <label><span>Time</span><input type="time" name="run_time" value="${settingsEsc(String(bot.run_time).slice(0, 5))}" required></label>
          <label><span>Sync button cooldown (min)</span><input type="number" name="cooldown" min="0" max="1440" step="1" value="${bot.cooldown_minutes}" required></label>
        </div>
        <div class="settings-actions"><span class="settings-status" data-unsaved role="status"></span><button type="submit" class="sop-action-button primary">Save</button></div>
      </div>
    </form>`).join('');
}

function settingsSaveBot(form) {
  const days = [...form.querySelectorAll('[name="day"]:checked')].map(box => Number(box.value));
  if (!days.length) {
    settingsToast('Pick at least one day, or switch the bot off.', true);
    return;
  }
  const patch = {
    enabled: form.elements.enabled.checked,
    run_days: days,
    run_time: form.elements.run_time.value,
    cooldown_minutes: Number(form.elements.cooldown.value),
    updated_at: new Date().toISOString(),
    updated_by: settingsEmail
  };
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.from('bot_settings').update(patch).eq('job', form.dataset.job);
    if (error) throw error;
    form.querySelector('[data-unsaved]').textContent = '';
  }, `${form.querySelector('h2').textContent} saved.`).finally(() => { button.disabled = false; });
}

// ── Report rules ─────────────────────────────────────────────────────────────

function settingsTierSummary() {
  const from = Number(settingsEl('tierOrangeFrom').value);
  const red = Number(settingsEl('tierRedFrom').value);
  const owner = id => (settingsEl(id).value.trim() ? ` (${settingsEl(id).value.trim()})` : '');
  settingsEl('tierSummary').textContent = from && red > from
    ? `Orange ${from}–${red - 1} days${owner('tierOrangeOwner')} · Red ${red}+ days${owner('tierRedOwner')}`
    : 'Orange must start before red.';
}

async function settingsLoadRules() {
  const client = await settingsClient();
  const { data, error } = await client.from('app_settings').select('value').eq('key', 'followup_tiers').maybeSingle();
  if (error) throw error;
  const tiers = data?.value || { orange: { from: 7, owner: 'Rachelle' }, red: { from: 14, owner: 'Darius' } };
  settingsEl('tierOrangeFrom').value = tiers.orange?.from ?? 7;
  settingsEl('tierOrangeOwner').value = tiers.orange?.owner ?? '';
  settingsEl('tierRedFrom').value = tiers.red?.from ?? 14;
  settingsEl('tierRedOwner').value = tiers.red?.owner ?? '';
  settingsTierSummary();
}

function settingsSaveRules(event) {
  event.preventDefault();
  const from = Number(settingsEl('tierOrangeFrom').value);
  const red = Number(settingsEl('tierRedFrom').value);
  if (!(Number.isInteger(from) && Number.isInteger(red) && from >= 1 && from < red)) {
    settingsToast('Orange must start at 1 day or more, before red starts.', true);
    return;
  }
  const value = {
    orange: { from, owner: settingsEl('tierOrangeOwner').value.trim() },
    red: { from: red, owner: settingsEl('tierRedOwner').value.trim() }
  };
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.from('app_settings')
      .upsert({ key: 'followup_tiers', value, updated_at: new Date().toISOString(), updated_by: settingsEmail });
    if (error) throw error;
  }, 'Follow-up tiers saved. Tonight\'s report uses them.');
}

// ── Roles and permission switches ────────────────────────────────────────────

async function settingsLoadRoles() {
  const client = await settingsClient();
  const [roles, switches, users] = await Promise.all([
    client.from('app_roles').select('*').order('name'),
    client.from('app_role_permissions').select('*'),
    client.rpc('list_portal_users')
  ]);
  for (const result of [roles, switches, users]) if (result.error) throw result.error;
  settingsRoles = roles.data;
  settingsUsers = users.data || [];
  settingsSwitches.clear();
  settingsRoles.forEach(role => settingsSwitches.set(role.key, new Set()));
  switches.data.forEach(row => settingsSwitches.get(row.role_key)?.add(row.permission));
  if (!settingsRoles.some(role => role.key === settingsRole)) settingsRole = (settingsRoles.find(role => role.key === 'staff') || settingsRoles[0])?.key;
  settingsRenderRoles();
  settingsRenderUsers();
}

const settingsUserCount = key => settingsUsers.filter(user => user.role_key === key).length;

function settingsRenderRoles() {
  settingsEl('roleList').innerHTML = settingsRoles.map(role => {
    const count = settingsUserCount(role.key);
    return `
      <li><button type="button" data-role="${settingsEsc(role.key)}"${role.key === settingsRole ? ' aria-current="true"' : ''}>
        <strong>${settingsEsc(role.name)}</strong>
        <small>${count} ${count === 1 ? 'user' : 'users'}${role.is_system ? ' · built-in' : ''}</small>
      </button></li>`;
  }).join('');

  const role = settingsRoles.find(item => item.key === settingsRole);
  if (!role) return;
  const isDev = role.key === 'dev';
  const allowed = settingsSwitches.get(role.key) || new Set();
  settingsEl('switchTitle').textContent = `${role.name} permissions`;
  settingsEl('switchCount').textContent = isDev ? 'Always everything' : `${allowed.size} switched on`;
  settingsEl('switchGroups').innerHTML = `
    ${isDev ? '<p class="page-lede">The dev role always has every permission, so nobody can lock the dev out.</p>' : role.description ? `<p class="page-lede">${settingsEsc(role.description)}</p>` : ''}
    ${ACCESS_PERMISSIONS.map(group => `
      <fieldset class="settings-switch-group">
        <legend>${settingsEsc(group.group)}</legend>
        ${group.items.map(([key, label]) => `
          <label class="settings-switch"><input type="checkbox" role="switch" value="${key}"${isDev || allowed.has(key) ? ' checked' : ''}${isDev ? ' disabled' : ''}><span>${settingsEsc(label)}</span></label>`).join('')}
      </fieldset>`).join('')}`;
  settingsEl('saveSwitchesBtn').hidden = isDev;
  settingsEl('deleteRoleBtn').hidden = role.is_system;
  settingsEl('switchStatus').textContent = '';
  settingsDirty = false;
}

function settingsPickRole(key) {
  if (key === settingsRole) return;
  if (settingsDirty && !window.confirm('Discard the unsaved permission changes?')) return;
  settingsRole = key;
  settingsRenderRoles();
}

function settingsSaveSwitches(event) {
  event.preventDefault();
  const role = settingsRole;
  const before = settingsSwitches.get(role) || new Set();
  const after = new Set([...settingsEl('switchGroups').querySelectorAll('input:checked')].map(box => box.value));
  const add = [...after].filter(key => !before.has(key));
  const remove = [...before].filter(key => !after.has(key));
  if (!add.length && !remove.length) {
    settingsToast('No changes to save.');
    return;
  }
  settingsRun(async () => {
    const client = await settingsClient();
    if (add.length) {
      const { error } = await client.from('app_role_permissions').insert(add.map(permission => ({ role_key: role, permission })));
      if (error) throw error;
    }
    if (remove.length) {
      const { error } = await client.from('app_role_permissions').delete().eq('role_key', role).in('permission', remove);
      if (error) throw error;
    }
    settingsSwitches.set(role, after);
    settingsRenderRoles();
  }, 'Permissions saved. People with this role see the change when they next load a page.');
}

function settingsAddRole(event) {
  event.preventDefault();
  const input = settingsEl('newRoleName');
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'role';
  let key = base.length >= 2 ? base : `${base}_role`;
  for (let n = 2; settingsRoles.some(role => role.key === key); n += 1) key = `${base}_${n}`;
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.from('app_roles').insert({ key, name, description: null });
    if (error) throw error;
    input.value = '';
    settingsRole = key;
    await settingsLoadRoles();
  }, `${name} added. Switch on what it can do, then save.`);
}

function settingsDeleteRole() {
  const role = settingsRoles.find(item => item.key === settingsRole);
  if (!role || role.is_system) return;
  if (settingsUserCount(role.key)) {
    settingsToast(`Move the ${settingsUserCount(role.key)} people with this role to another role first.`, true);
    return;
  }
  if (!window.confirm(`Delete the ${role.name} role?`)) return;
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.from('app_roles').delete().eq('key', role.key);
    if (error) throw error;
    settingsRole = null;
    await settingsLoadRoles();
  }, `${role.name} deleted.`);
}

// ── Users ────────────────────────────────────────────────────────────────────

function settingsRenderUsers() {
  settingsEl('userCount').textContent = `${settingsUsers.length} ${settingsUsers.length === 1 ? 'user' : 'users'}`;
  const me = settingsEmail.toLowerCase();
  const roleOptions = current => settingsRoles
    .filter(role => role.key !== 'dev' || settingsAccess.is_dev || current === 'dev')
    .map(role => `<option value="${settingsEsc(role.key)}"${role.key === current ? ' selected' : ''}>${settingsEsc(role.name)}</option>`).join('');
  settingsEl('userTable').innerHTML = settingsUsers.length ? `
    <table class="stack settings-user-table">
      <thead><tr><th>Email</th><th>Last sign-in</th><th>Role</th></tr></thead>
      <tbody>${settingsUsers.map(user => {
        const self = String(user.email || '').toLowerCase() === me;
        const locked = self || (user.role_key === 'dev' && !settingsAccess.is_dev);
        return `
          <tr>
            <td data-label="Email"><strong>${settingsEsc(user.email)}</strong>${self ? ' <small class="pd-sub">You</small>' : ''}</td>
            <td data-label="Last sign-in">${settingsEsc(settingsWhen(user.last_sign_in_at) || 'Never')}</td>
            <td data-label="Role"><label class="sr-only" for="role-${settingsEsc(user.user_id)}">Role for ${settingsEsc(user.email)}</label>
              <select id="role-${settingsEsc(user.user_id)}" data-user="${settingsEsc(user.user_id)}"${locked ? ` disabled title="${self ? 'You can\'t change your own role.' : 'Only the dev can change a dev.'}"` : ''}>${roleOptions(user.role_key)}</select></td>
          </tr>`;
      }).join('')}</tbody>
    </table>` : '<div class="empty">No users found.</div>';
}

function settingsSetUserRole(select) {
  const user = settingsUsers.find(item => item.user_id === select.dataset.user);
  if (!user) return;
  const roleKey = select.value;
  const role = settingsRoles.find(item => item.key === roleKey);
  if (roleKey === 'dev' && !window.confirm(`Give ${user.email} full dev access? They'll be able to change everything, including roles.`)) {
    select.value = user.role_key;
    return;
  }
  select.disabled = true;
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.from('app_user_roles')
      .upsert({ user_id: user.user_id, role_key: roleKey, updated_at: new Date().toISOString(), updated_by: settingsEmail });
    if (error) throw error;
    user.role_key = roleKey;
    settingsRenderRoles();
  }, `${user.email} is now ${role?.name || roleKey}.`).finally(() => {
    select.value = user.role_key;
    select.disabled = false;
  });
}

// ── Account ──────────────────────────────────────────────────────────────────

function settingsRenderAccount() {
  const user = settingsUser;
  const facts = [
    ['Name', user.user_metadata?.full_name || 'Not set'],
    ['Email', user.email],
    ['Role', settingsAccess ? settingsAccess.role_name : 'Roles not set up yet'],
    ['Last sign-in', settingsWhen(user.last_sign_in_at) || 'Unknown'],
    ['Account created', user.created_at ? new Date(user.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown']
  ];
  settingsEl('accountFacts').innerHTML = facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${settingsEsc(value)}</dd></div>`).join('');
  settingsEl('accessRoleName').textContent = settingsAccess ? settingsAccess.role_name : '';
  settingsEl('accessList').innerHTML = settingsAccess
    ? ACCESS_PERMISSIONS.filter(group => group.group !== 'System').map(group => `
        <div class="settings-access-group">
          <h3>${settingsEsc(group.group)}</h3>
          <ul>${group.items.map(([key, label]) => {
            const yes = settingsAccess.can(key);
            return `<li class="${yes ? 'is-yes' : 'is-no'}"><span aria-hidden="true">${yes ? '✓' : '–'}</span>${settingsEsc(label)}<span class="sr-only">${yes ? ': allowed' : ': not allowed'}</span></li>`;
          }).join('')}</ul>
        </div>`).join('')
    : '<p class="page-lede">Roles aren\'t set up yet, so everyone can use everything.</p>';
}

function settingsSignOutEverywhere() {
  if (!window.confirm('Sign out of every device, including this one?')) return;
  settingsRun(async () => {
    const client = await settingsClient();
    const { error } = await client.auth.signOut({ scope: 'global' });
    if (error) throw error;
    window.location.replace('login.html');
  });
}

// ── Preferences ──────────────────────────────────────────────────────────────

function settingsRenderPrefs() {
  const meta = settingsUser.user_metadata || {};
  const pages = SETTINGS_START_PAGES.filter(([, , area]) => !area || !settingsAccess || settingsAccess.can(`${area}.view`));
  settingsEl('prefStartPage').innerHTML = pages
    .map(([path, label]) => `<option value="${settingsEsc(path)}"${path === (meta.start_page || '') ? ' selected' : ''}>${settingsEsc(label)}</option>`).join('');
  settingsEl('prefReduceMotion').checked = Boolean(meta.reduce_motion);
}

function settingsSavePrefs(event) {
  event.preventDefault();
  const data = { start_page: settingsEl('prefStartPage').value || null, reduce_motion: settingsEl('prefReduceMotion').checked };
  settingsRun(async () => {
    const client = await settingsClient();
    const { data: result, error } = await client.auth.updateUser({ data });
    if (error) throw error;
    settingsUser = result.user;
    document.documentElement.classList.toggle('reduce-motion', data.reduce_motion);
  }, 'Preferences saved.');
}

// ── System status ────────────────────────────────────────────────────────────

function settingsAgo(value) {
  const hours = (Date.now() - Date.parse(value)) / 3600000;
  if (hours < 1) return 'under an hour ago';
  if (hours < 1.5) return '1 hour ago';
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

async function settingsLoadStatus() {
  const client = await settingsClient();
  const cards = await Promise.all(SETTINGS_SOURCES.map(async source => {
    const bot = settingsBotRows.find(row => row.job === source.bot);
    let state;
    let lines = [];
    if (!settingsAccess.can(`${source.area}.view`)) {
      state = ['No access', 'is-muted'];
    } else {
      const { data, error } = await source.load(client);
      if (error) state = ['Unavailable', 'is-muted'];
      else if (!data) state = ['No data yet', 'is-muted'];
      else {
        const at = source.at(data);
        const behind = Date.now() - Date.parse(at) > source.maxHours * 3600000;
        state = bot && !bot.enabled ? ['Bot off', 'is-muted'] : behind ? ['Behind', 'is-late'] : ['Up to date', 'is-ok'];
        lines = [`Last data ${settingsWhen(at)} (${settingsAgo(at)})`, source.detail(data)];
      }
    }
    if (bot?.last_started_at) lines.push(`Bot last started ${settingsWhen(bot.last_started_at)} by ${bot.last_started_by || 'scheduler'}`);
    return `
      <div class="card settings-status-card">
        <div class="card-heading-row"><h2>${settingsEsc(source.label)}</h2><span class="settings-pill ${state[1]}">${state[0]}</span></div>
        <ul class="settings-status-lines">${lines.map(line => `<li>${settingsEsc(line)}</li>`).join('') || '<li>Nothing to show.</li>'}</ul>
        ${state[0] === 'Behind' && bot ? '<p class="settings-pad"><a href="#bots" data-goto="bots">Check the bot\'s settings</a></p>' : ''}
      </div>`;
  }));
  settingsEl('statusList').innerHTML = cards.join('');
}

// ── Activity log ─────────────────────────────────────────────────────────────

const SETTINGS_PERMISSION_LABELS = Object.fromEntries(ACCESS_PERMISSIONS.flatMap(group => group.items.map(([key, label]) => [key, `${group.group}: ${label}`])));
const settingsRoleName = key => settingsRoles.find(role => role.key === key)?.name || key;
const settingsUserEmail = id => settingsUsers.find(user => user.user_id === id)?.email || 'a user';

function settingsDescribe(row) {
  const now = row.new_row || {};
  const was = row.old_row || {};
  switch (row.table_name) {
    case 'app_role_permissions':
      return `${row.action === 'insert' ? 'Switched on' : 'Switched off'} "${SETTINGS_PERMISSION_LABELS[now.permission || was.permission] || now.permission || was.permission}" for ${settingsRoleName(now.role_key || was.role_key)}`;
    case 'app_roles':
      if (row.action === 'insert') return `Added the ${now.name} role`;
      if (row.action === 'delete') return `Deleted the ${was.name} role`;
      return `Renamed the ${was.name} role to ${now.name}`;
    case 'app_user_roles':
      return row.action === 'delete'
        ? `Removed the role of ${settingsUserEmail(was.user_id)}`
        : `Set ${settingsUserEmail(now.user_id)} to ${settingsRoleName(now.role_key)}${was.role_key ? ` (was ${settingsRoleName(was.role_key)})` : ''}`;
    case 'bot_settings': {
      const changes = [];
      if (now.enabled !== was.enabled) changes.push(now.enabled ? 'switched on' : 'switched off');
      if (String(now.run_time) !== String(was.run_time)) changes.push(`time ${String(now.run_time).slice(0, 5)}`);
      if (JSON.stringify(now.run_days) !== JSON.stringify(was.run_days)) changes.push(`days ${(now.run_days || []).map(day => SETTINGS_DAYS[day]).join(', ')}`);
      if (now.cooldown_minutes !== was.cooldown_minutes) changes.push(`cooldown ${now.cooldown_minutes} min`);
      return `${now.label || was.label}: ${changes.join(', ') || 'saved, no change'}`;
    }
    case 'app_settings':
      return now.key === 'followup_tiers'
        ? `Follow-up tiers: orange from ${now.value?.orange?.from} days (${now.value?.orange?.owner || 'nobody'}), red from ${now.value?.red?.from} days (${now.value?.red?.owner || 'nobody'})`
        : `Changed setting ${now.key || was.key}`;
    default:
      return settingsDescribeData(row);
  }
}

// Audit log tables: [page, what one row is]. The page is also the "All pages" filter.
const SETTINGS_AUDIT_TABLES = {
  past_due_member_log: ['Past Due', 'bill'], past_due_exempted_members: ['Past Due', 'exemption'],
  past_due_failure_reason: ['Past Due', 'failure reason'], past_due_member_notes: ['Past Due', 'member note'],
  past_due_import_runs: ['Past Due', 'import run'],
  membership_data: ['Monday Board', 'member list row'], membership_data_previous: ['Monday Board', 'last week\'s list row'],
  membership_data_log: ['Monday Board', 'archived list row'], membership_weekly_log: ['Monday Board', 'weekly count'],
  pricing_settings: ['Monday Board', 'pricing setting'],
  follow_up_reports: ['Follow-Up', 'follow-up report'], follow_up_contacts: ['Follow-Up', 'contact log entry'],
  ad_review_ads: ['Ad Review', 'ad'], ad_review_snapshots: ['Ad Review', 'ad snapshot'], ad_review_actions: ['Ad Review', 'ad action'],
  ad_review_leads: ['Ad Review', 'lead'], ad_review_playbook: ['Ad Review', 'playbook'],
  geronimo_weekly: ['Geronimo Metrics', 'week'], geronimo_wave_members: ['Geronimo Metrics', 'wave member'],
  geronimo_scoreboard: ['Geronimo Metrics', 'scoreboard day'],
  sop_documents: ['SOPs', 'SOP'], tasks: ['Home', 'task'],
  app_roles: ['Settings', 'role'], app_role_permissions: ['Settings', 'permission'], app_user_roles: ['Settings', 'user role'],
  bot_settings: ['Settings', 'bot setting'], app_settings: ['Settings', 'report rule']
};
const SETTINGS_AUDIT_PAGE = 100;
const SETTINGS_AUDIT_QUIET = new Set(['id', 'created_at', 'updated_at', 'imported_at', 'uploaded_at', 'archived_at', 'edited_at', 'edited_by', 'updated_by', 'raw_data']);
let settingsAuditRows = [];

const settingsRowName = row => row && (row.member_name || row.name || [row.first_name, row.last_name].filter(Boolean).join(' ')
  || row.ad_name || row.label || row.title || row.reason || row.key || row.report_date || (row.number != null ? `#${row.number}` : ''));
const settingsShort = value => {
  const text = value === null || value === undefined || value === '' ? 'empty' : typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

// A report row change: bulk imports as a count; single edits name the row and what changed.
function settingsDescribeData(row) {
  const thing = SETTINGS_AUDIT_TABLES[row.table_name]?.[1] || row.table_name;
  const verb = { insert: 'Added', update: 'Changed', delete: 'Removed' }[row.action] || row.action;
  if (row.row_count > 1) return `${verb} ${row.row_count} ${thing.endsWith('entry') ? `${thing.slice(0, -1)}ies` : `${thing}s`}`;
  const now = row.new_row;
  const was = row.old_row;
  const name = settingsRowName(now || was);
  let text = `${verb} ${thing}${name ? ` (${name})` : ''}`;
  if (row.action === 'update' && now && was) {
    const changes = Object.keys(now)
      .filter(key => !SETTINGS_AUDIT_QUIET.has(key) && JSON.stringify(now[key]) !== JSON.stringify(was[key]))
      .slice(0, 3)
      .map(key => `${key.replace(/_/g, ' ')} ${settingsShort(was[key])} → ${settingsShort(now[key])}`);
    if (changes.length) text += `: ${changes.join('; ')}`;
  }
  if (row.action === 'insert' && now?.note) text += `: "${settingsShort(now.note)}"`;
  return text;
}

async function settingsLoadActivity(more = false) {
  const client = await settingsClient();
  if (!settingsRoles.length) settingsRoles = (await client.from('app_roles').select('*')).data || [];

  const actor = settingsEl('activityActor').value;
  const area = settingsEl('activityArea').value;
  const from = settingsEl('activityFrom').value;
  let query = client.from('app_audit_log').select('*').order('at', { ascending: false }).limit(SETTINGS_AUDIT_PAGE);
  if (actor) query = query.eq('actor', actor);
  if (area) query = query.in('table_name', Object.keys(SETTINGS_AUDIT_TABLES).filter(table => SETTINGS_AUDIT_TABLES[table][0] === area));
  if (from) query = query.gte('at', new Date(`${from}T00:00:00`).toISOString());
  if (more && settingsAuditRows.length) query = query.lt('at', settingsAuditRows[settingsAuditRows.length - 1].at);

  const { data, error } = await query;
  if (error?.code === 'PGRST205') { // table not created yet
    settingsEl('activityTable').innerHTML = '<div class="empty">The audit log needs <code>supabase/access_control.sql</code> run again (it keeps your roles and switches).</div>';
    return;
  }
  if (error) throw error;
  settingsAuditRows = more ? [...settingsAuditRows, ...data] : data;

  // Filter choices: people seen in the log (plus portal users when known), and each page.
  const actorSelect = settingsEl('activityActor');
  const people = [...new Set([...settingsUsers.map(user => user.email), ...settingsAuditRows.map(row => row.actor), actor].filter(Boolean))].sort();
  actorSelect.innerHTML = `<option value="">Everyone</option>${people.map(email => `<option value="${settingsEsc(email)}"${email === actor ? ' selected' : ''}>${settingsEsc(email)}</option>`).join('')}`;
  const areaSelect = settingsEl('activityArea');
  if (areaSelect.length === 1) {
    [...new Set(Object.values(SETTINGS_AUDIT_TABLES).map(([page]) => page))].forEach(page => areaSelect.add(new Option(page, page)));
  }

  settingsEl('activityMore').hidden = data.length < SETTINGS_AUDIT_PAGE;
  settingsEl('activityCount').textContent = `${settingsAuditRows.length}${data.length < SETTINGS_AUDIT_PAGE ? '' : '+'} ${settingsAuditRows.length === 1 ? 'change' : 'changes'}`;
  settingsEl('activityTable').innerHTML = settingsAuditRows.length ? `
    <table class="stack settings-activity-table">
      <thead><tr><th>When</th><th>Who</th><th>Page</th><th>What</th></tr></thead>
      <tbody>${settingsAuditRows.map(row => `
        <tr>
          <td data-label="When">${settingsEsc(settingsWhen(row.at))}</td>
          <td data-label="Who">${settingsEsc(row.actor)}</td>
          <td data-label="Page">${settingsEsc(SETTINGS_AUDIT_TABLES[row.table_name]?.[0] || '')}</td>
          <td data-label="What">${settingsEsc(settingsDescribe(row))}</td>
        </tr>`).join('')}</tbody>
    </table>` : '<div class="empty">No changes match.</div>';
}

// ── Page ─────────────────────────────────────────────────────────────────────

function settingsShowTab(name) {
  document.querySelectorAll('nav.site-nav button').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
}

async function initSettingsPage() {
  settingsAccess = await window.portalAccess;
  const { data: { session } } = await (await settingsClient()).auth.getSession();
  settingsUser = session.user;
  settingsEmail = settingsUser.email || '';

  // Account and Preferences are everyone's; the rest need roles (supabase/access_control.sql).
  const tabs = [...document.querySelectorAll('nav.site-nav button')];
  const usable = button => !button.dataset.requires || Boolean(settingsAccess?.can(button.dataset.requires));
  if (!settingsAccess) {
    settingsEl('settingsSetup').hidden = false;
    tabs.filter(button => !usable(button)).forEach(button => { button.style.display = 'none'; });
  }
  tabs.forEach(button => button.addEventListener('click', () => {
    settingsShowTab(button.dataset.tab);
    history.replaceState(null, '', `#${button.dataset.tab}`);
  }));
  // In-page links between tabs (System status "Check the bot's settings").
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-goto]');
    if (!link) return;
    event.preventDefault();
    settingsShowTab(link.dataset.goto);
    history.replaceState(null, '', `#${link.dataset.goto}`);
  });
  const linked = tabs.find(button => button.dataset.tab === window.location.hash.slice(1) && usable(button));
  settingsShowTab(linked ? linked.dataset.tab : 'account');

  settingsRenderAccount();
  settingsRenderPrefs();
  settingsEl('signOutEverywhereBtn').addEventListener('click', settingsSignOutEverywhere);
  settingsEl('prefsForm').addEventListener('submit', settingsSavePrefs);
  if (!settingsAccess) return;

  if (settingsAccess.can('bots.manage')) {
    settingsEl('botList').addEventListener('submit', event => { event.preventDefault(); settingsSaveBot(event.target); });
    // While editing a bot: the switch label, next run and an unsaved marker follow the fields.
    settingsEl('botList').addEventListener('input', event => {
      const form = event.target.closest('form.settings-bot');
      if (!form) return;
      const enabled = form.elements.enabled.checked;
      const runDays = [...form.querySelectorAll('[name="day"]:checked')].map(box => Number(box.value));
      form.querySelector('[data-switch-label]').textContent = enabled ? 'On' : 'Off';
      form.querySelector('[data-next-run]').textContent = settingsNextRun({ enabled, run_days: runDays, run_time: form.elements.run_time.value });
      form.querySelector('[data-unsaved]').textContent = 'Unsaved changes';
    });
    settingsEl('tierForm').addEventListener('submit', settingsSaveRules);
    settingsEl('tierForm').addEventListener('input', settingsTierSummary);
    settingsRun(async () => {
      await Promise.all([settingsLoadBots(), settingsLoadRules()]);
      await settingsLoadStatus();
    });
  }

  if (settingsAccess.can('access.manage')) {
    settingsEl('roleList').addEventListener('click', event => {
      const key = event.target.closest('[data-role]')?.dataset.role;
      if (key) settingsPickRole(key);
    });
    settingsEl('switchGroups').addEventListener('change', () => {
      settingsDirty = true;
      settingsEl('switchStatus').textContent = 'Unsaved changes';
    });
    settingsEl('switchForm').addEventListener('submit', settingsSaveSwitches);
    settingsEl('deleteRoleBtn').addEventListener('click', settingsDeleteRole);
    settingsEl('newRoleForm').addEventListener('submit', settingsAddRole);
    settingsEl('userTable').addEventListener('change', event => {
      if (event.target.matches('select[data-user]')) settingsSetUserRole(event.target);
    });
  }
  // Roles and users first: the audit log names them.
  const rolesReady = settingsAccess.can('access.manage') ? settingsRun(settingsLoadRoles) : Promise.resolve();

  if (settingsAccess.can('audit.view')) {
    settingsEl('activityFilters').addEventListener('change', () => settingsRun(() => settingsLoadActivity()));
    settingsEl('activityFilters').addEventListener('submit', event => event.preventDefault());
    settingsEl('activityMore').addEventListener('click', () => settingsRun(() => settingsLoadActivity(true)));
    rolesReady.then(() => settingsRun(() => settingsLoadActivity()));
  }
}

initSettingsPage();
