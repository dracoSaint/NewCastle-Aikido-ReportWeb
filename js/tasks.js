// Task list (supabase/notifications_tasks.sql). Loaded on every signed-in page by js/auth.js:
// - every page but Tasks: the TASKS tab on the right edge, which slides out today's list (tick, quick
//   add, Mine / Whole team); it stays open or closed as you move between pages;
// - pages/Tasks.html: every task (#taskLists data-mode="all") and the next 7 days (#taskUpcoming).
// - the open-today count on the tab and the menu's Task list link ([data-task-count]).
// pages/Tasks.html#new opens Add task. A repeating task is ticked off per day; a one-off task stays
// on today's list from its due date until it is ticked.

const TASK_REPEATS = { none: 'One-off', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };

function taskToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

function taskAddDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Is the task on the list for `day` (YYYY-MM-DD)? Weekly = the start date's weekday; monthly = the
// start date's day of the month (or the month's last day). One-off tasks show from their due date
// until done (so overdue ones stay).
function taskIsOn(task, day) {
  if (task.repeat === 'none') return task.start_date <= day;
  if (task.start_date > day) return false;
  const date = new Date(`${day}T00:00:00Z`);
  const start = new Date(`${task.start_date}T00:00:00Z`);
  if (task.repeat === 'weekdays') return date.getUTCDay() % 6 !== 0;
  if (task.repeat === 'weekly') return date.getUTCDay() === start.getUTCDay();
  if (task.repeat === 'monthly') {
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return date.getUTCDate() === Math.min(start.getUTCDate(), last);
  }
  return true; // daily
}

function taskDaysLate(task, day) {
  return task.repeat === 'none' ? Math.round((new Date(`${day}T00:00:00Z`) - new Date(`${task.start_date}T00:00:00Z`)) / 86400000) : 0;
}

// Coming up after today: [day, tasks] for each of the next `days` days that has any. Repeating tasks
// on their days; one-off tasks on their due date (not yet done).
function taskUpcoming(tasks, today, days, isDone) {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const day = taskAddDays(today, i);
    const list = tasks.filter(task => task.repeat === 'none' ? task.start_date === day && !isDone(task) : taskIsOn(task, day));
    if (list.length) out.push([day, list]);
  }
  return out;
}

// List order: high priority first, then by due / start date (so overdue first), then oldest first.
function taskOrder(a, b) {
  return (b.priority === 'high') - (a.priority === 'high') || a.start_date.localeCompare(b.start_date) || a.id - b.id;
}

// Portal links are resolved from this file's own address (pages sit at different depths).
const TASK_SCRIPT_SRC = typeof document !== 'undefined' ? document.currentScript?.src : '';
const taskUrl = path => new URL(`../${path}`, TASK_SCRIPT_SRC || 'http://localhost/js/').href;

// Pages a task can open (Edit task > Opens). A task opening Past Due lists the follow-ups under it.
const TASK_PAST_DUE = 'pages/REPORTs/PastDueMembers.html';
const TASK_PAGES = [
  ['', 'Nothing'],
  [TASK_PAST_DUE, 'Past Due Members'],
  ['pages/REPORTs/FollowUpReport.html', 'Red / Orange Follow-Up'],
  ['pages/REPORTs/MondayBoardReport.html', 'Monday Board Report'],
  ['pages/REPORTs/DailyAdReview.html', 'Daily Ad Review'],
  ['pages/REPORTs/GeronimoMetrics.html', 'Geronimo Metrics Report'],
  ['pages/REPORTs/GradingReport.html', 'Grading Report'],
  ['pages/SOPs/SOPDocuments.html', 'SOP Library']
];

const TASK_DIALOG = `
  <dialog class="fu-dialog" id="taskDialog" aria-labelledby="taskDialogTitle">
    <form method="dialog" id="taskForm">
      <h2 id="taskDialogTitle">Add task</h2>
      <div class="gm-fields">
        <label class="gm-wide"><span>Task</span><input name="title" required maxlength="200" autocomplete="off"></label>
        <label class="gm-wide"><span>Details</span><textarea name="details" rows="2" maxlength="2000" data-mention placeholder="Optional. Type @ to tag someone"></textarea></label>
        <label><span>For</span><select name="assigned_to"></select></label>
        <label><span>Repeats</span>
          <select name="repeat">
            <option value="none">Doesn't repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays (Mon–Fri)</option>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </label>
        <label><span id="taskDateLabel">Due date</span><input name="start_date" type="date" required></label>
        <label><span>Priority</span><select name="priority"><option value="normal">Normal</option><option value="high">High</option></select></label>
        <label class="gm-wide"><span>Opens</span><select name="link">${TASK_PAGES.map(([path, label]) => `<option value="${path}">${label}</option>`).join('')}</select></label>
        <fieldset class="gm-wide task-watchers"><legend>Followers <small>(told when it's done or commented on)</small></legend>
          <details id="taskWatchersPick"><summary id="taskWatchersSummary">Nobody</summary><div id="taskWatchers"></div></details></fieldset>
      </div>
      <div class="fu-dialog-actions">
        <button type="button" class="sop-action-button danger" id="taskDelete" hidden>Delete</button>
        <button type="button" class="sop-action-button secondary" id="taskCancel">Cancel</button>
        <button type="submit" class="sop-action-button primary">Save</button>
      </div>
    </form>
    <section class="task-comments" id="taskComments" aria-labelledby="taskCommentsTitle" hidden>
      <h3 id="taskCommentsTitle">Comments</h3>
      <ul class="task-comment-list" id="taskCommentList"></ul>
      <form class="task-comment-form" id="taskCommentForm">
        <label class="sr-only" for="taskCommentText">Add a comment</label>
        <textarea id="taskCommentText" name="body" rows="2" maxlength="1000" required data-mention placeholder="Add a comment. Type @ to tag someone"></textarea>
        <button type="submit" class="sop-action-button secondary">Comment</button>
      </form>
    </section>
  </dialog>`;

// The TASKS tab on the right edge of every page (not the Tasks page, which has the full list): it
// slides out today's list. Open or closed is remembered in this browser, so it stays as you move around.
const TASK_PANEL_KEY = 'portal-tasks-open';
const taskPanelHtml = allUrl => `
  <button type="button" class="task-tab" id="taskTab" aria-expanded="false" aria-controls="taskPanel">
    <span>Tasks</span><span class="task-tab-count" data-task-count hidden></span>
  </button>
  <aside class="task-panel" id="taskPanel" aria-labelledby="tasksTitle" inert>
    <div class="task-panel-head">
      <h2 id="tasksTitle">Today's tasks <small id="taskSummary"></small></h2>
      <button type="button" class="task-panel-close" id="taskClose" aria-label="Close tasks">×</button>
    </div>
    <div class="task-panel-tools">
      <div class="fu-segment" role="group" aria-label="Whose tasks">
        <button type="button" data-scope="mine" aria-pressed="true">Mine</button>
        <button type="button" data-scope="all" aria-pressed="false">Whole team</button>
      </div>
      <button type="button" class="sop-action-button primary" id="taskAdd">Add task</button>
    </div>
    <p class="task-status" id="taskStatus" role="status"></p>
    <div class="task-panel-body" id="taskLists"><p class="task-empty">Loading tasks…</p></div>
    <a class="task-more task-panel-all" href="${allUrl}">All tasks and the next 7 days</a>
  </aside>`;

function taskPanelInit() {
  document.body.insertAdjacentHTML('beforeend', taskPanelHtml(taskUrl('pages/Tasks.html')));
  const tab = document.getElementById('taskTab');
  const panel = document.getElementById('taskPanel');
  const setOpen = open => {
    panel.classList.toggle('open', open);
    panel.inert = !open;
    tab.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(TASK_PANEL_KEY, open ? '1' : ''); } catch {}
  };
  let stored = '';
  try { stored = localStorage.getItem(TASK_PANEL_KEY); } catch {}
  // Phones: it covers the page, so it always starts closed there.
  setOpen(Boolean(stored) && window.matchMedia('(min-width: 761px)').matches);
  tab.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  document.getElementById('taskClose').addEventListener('click', () => { setOpen(false); tab.focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open') && !document.querySelector('dialog[open]')) setOpen(false);
  });
}

function taskInit() {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!document.getElementById('taskLists')) taskPanelInit();
  const box = document.getElementById('taskLists');
  const showAll = box?.dataset.mode === 'all'; // Tasks page: every task; the slide-out panel: today's only
  const upcomingBox = document.getElementById('taskUpcoming');
  let client, me, people = [], tasks = [], ticks = [], scope = 'mine', editing = null, commentCounts = new Map();
  let pastDueFollowUps = null; // loaded once per page, when a task opens the Past Due report
  let dialog, form, fields;

  const status = document.getElementById('taskStatus');
  const say = (text, bad) => { if (!status) return; status.textContent = text; status.classList.toggle('is-bad', Boolean(bad)); };
  const nameOf = id => people.find(person => person.user_id === id)?.name || 'Someone';
  const tickFor = task => ticks.find(tick => tick.task_id === task.id && (task.repeat === 'none' || tick.done_on === taskToday()));
  const doneBefore = task => task.repeat === 'none' && ticks.some(tick => tick.task_id === task.id && tick.done_on !== taskToday());
  const inScope = (task, who) => who === 'all' || !task.assigned_to || task.assigned_to === me.id;
  const todays = who => tasks.filter(task => taskIsOn(task, taskToday()) && inScope(task, who) && !doneBefore(task));

  async function load() {
    const today = taskToday();
    const { data, error } = await client.from('tasks').select('*').order('start_date').order('id');
    if (error) {
      if (box) box.innerHTML = `<p class="pd-notice">${/does not exist|schema cache/i.test(error.message) ? 'The task list needs a one-time database update: run <code>supabase/notifications_tasks.sql</code>.' : esc(error.message)}</p>`;
      return;
    }
    tasks = data.sort(taskOrder);
    const oneOff = tasks.filter(task => task.repeat === 'none').map(task => task.id);
    const [done, talk] = await Promise.all([
      client.from('task_done').select('*').or(`done_on.eq.${today}${oneOff.length ? `,task_id.in.(${oneOff.join(',')})` : ''}`),
      box ? client.from('task_comments').select('task_id') : { data: [] }
    ]);
    ticks = done.data || [];
    commentCounts = new Map();
    (talk.data || []).forEach(row => commentCounts.set(row.task_id, (commentCounts.get(row.task_id) || 0) + 1));
    render();
    if (box && !pastDueFollowUps && tasks.some(task => task.link === TASK_PAST_DUE)) {
      await loadPastDueFollowUps().catch(() => { pastDueFollowUps = []; });
      render();
      // Sidebar Today card: follow-ups due today or overdue.
      window.dispatchEvent(new CustomEvent('portal-pastdue', { detail: pastDueFollowUps.filter(member => member.date <= new Date().toLocaleDateString('en-CA')).length }));
    }
  }

  function whenText(task) {
    const late = taskDaysLate(task, taskToday());
    if (task.repeat !== 'none') return TASK_REPEATS[task.repeat];
    if (late > 0) return `<span class="task-late">${late === 1 ? '1 day' : `${late} days`} overdue</span>`;
    if (late === 0) return 'Due today';
    return `Due ${new Date(`${task.start_date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
  }

  const shortDate = day => new Date(`${day}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  // upcoming: no tick box (it can only be ticked on the day). On the all-tasks list, repeating tasks
  // not on today show without a tick box too.
  function itemHtml(task, upcoming) {
    const canTick = !upcoming && (task.repeat === 'none' || taskIsOn(task, taskToday()));
    const tick = canTick && tickFor(task);
    const when = upcoming ? TASK_REPEATS[task.repeat]
      : tick && task.repeat === 'none' ? `Done ${shortDate(tick.done_on)}`
      : task.repeat !== 'none' && task.start_date > taskToday() ? `${TASK_REPEATS[task.repeat]} from ${shortDate(task.start_date)}`
      : task.repeat !== 'none' && !canTick ? `${TASK_REPEATS[task.repeat]} · not today`
      : whenText(task);
    const who = task.assigned_to ? nameOf(task.assigned_to) : 'Whole team';
    const initials = task.assigned_to ? who.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() : 'All';
    const late = !tick && task.repeat === 'none' && taskDaysLate(task, taskToday()) > 0;
    const high = task.priority === 'high' ? '<span class="task-high">High</span>' : '';
    const talk = commentCounts.get(task.id) ? ` · ${commentCounts.get(task.id)} ${commentCounts.get(task.id) === 1 ? 'comment' : 'comments'}` : '';
    const page = TASK_PAGES.find(([path]) => path && path === task.link);
    const open = page ? `<a class="task-link" href="${esc(taskUrl(page[0]))}">Open ${esc(page[1])}<span aria-hidden="true"> →</span></a>` : '';
    const text = `<span class="task-text"><span class="task-title">${high}${esc(task.title)}</span>${task.details ? `<small>${esc(task.details)}</small>` : ''}${open}</span>`;
    return `<li class="task-item${tick ? ' is-done' : ''}${late ? ' is-late' : ''}">
      ${!canTick ? `<span class="task-check is-plain">${text}</span>` : `<label class="task-check"><input type="checkbox" data-tick="${task.id}"${tick ? ' checked' : ''}>${text}</label>`}
      <span class="task-meta">${when}${tick ? ` · done by ${esc(tick.done_by?.split('@')[0])}` : ''}${talk}</span>
      <span class="task-who${task.assigned_to ? '' : ' is-team'}" title="For ${esc(who)}"><span class="sr-only">For ${esc(who)}</span><span aria-hidden="true">${esc(initials)}</span></span>
      <button type="button" class="task-edit" data-edit="${task.id}" aria-label="Edit ${esc(task.title)}">Edit</button>
      ${!upcoming && task.link === TASK_PAST_DUE ? pastDueListHtml() : ''}
    </li>`;
  }

  // Under a task that opens the Past Due report: members whose follow-up is overdue, due today or
  // due in the next 3 days (same rule as the report's Next follow-up column), soonest first.
  function pastDueListHtml() {
    if (!pastDueFollowUps) return '<p class="task-sub-empty">Loading follow-ups…</p>';
    if (!pastDueFollowUps.length) return '<p class="task-sub-empty">No Past Due follow-ups due in the next 3 days.</p>';
    const today = taskToday();
    const shown = pastDueFollowUps.slice(0, 8);
    const more = pastDueFollowUps.length - shown.length;
    return `<ul class="task-sub" aria-label="Past Due follow-ups">${shown.map(member => {
      const late = taskDaysLate({ repeat: 'none', start_date: member.date }, today);
      const when = late > 0 ? `<span class="task-late">${late === 1 ? '1 day' : `${late} days`} overdue</span>` : late === 0 ? 'Today' : shortDate(member.date);
      return `<li><a href="${esc(`${taskUrl(TASK_PAST_DUE)}?member=${encodeURIComponent(member.name)}`)}"><strong>${esc(member.name)}</strong><span>${esc(member.amount)}</span><span>${when}</span><small>${esc(member.step)}</small></a></li>`;
    }).join('')}</ul>${more > 0 ? `<a class="task-sub-more" href="${esc(taskUrl(TASK_PAST_DUE))}">+${more} more on the Past Due report</a>` : ''}`;
  }

  // Loaded only when a task on today's list opens the Past Due report and the role can view it.
  async function loadPastDueFollowUps() {
    const access = await window.portalAccess;
    if (access && !access.can('pastdue.view')) { pastDueFollowUps = []; return; }
    if (typeof pastDueMemberFollowUp === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = Object.assign(document.createElement('script'), { src: taskUrl('js/pastDueCore.js'), onload: resolve, onerror: reject });
        document.head.append(script);
      });
    }
    const [log, exempt, notes] = await Promise.all([
      client.from('past_due_member_log').select('member_key, member_number, member_name, amount, status, due_date, days_overdue, next_follow_up, escalated_to_darius, stage'),
      client.from('past_due_exempted_members').select('member_key, member_number, member_name'),
      client.from('past_due_member_notes').select('member_identity, created_at').order('created_at', { ascending: false })
    ]);
    if (log.error) { pastDueFollowUps = []; return; }
    const lastNote = new Map();
    (notes.data || []).forEach(note => { if (!lastNote.has(note.member_identity)) lastNote.set(note.member_identity, new Date(note.created_at).toLocaleDateString('en-CA')); });
    const today = new Date().toLocaleDateString('en-CA'); // local day, as the report uses
    const soon = taskAddDays(today, 3);
    pastDueFollowUps = pastDueOpenMembers(log.data, exempt.data)
      .map(member => ({ ...pastDueMemberFollowUp(member.bills, lastNote.get(member.key) || null, today), name: member.member_name,
        amount: member.bills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) }))
      .filter(member => member.date && member.date <= soon)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function render() {
    const mineToday = todays('mine');
    const mineLeft = mineToday.filter(task => !tickFor(task)).length;
    // Home's "At a glance" tile listens for this (js/homeGlance.js).
    window.dispatchEvent(new CustomEvent('portal-tasks', { detail: { total: mineToday.length, done: mineToday.length - mineLeft } }));
    document.querySelectorAll('[data-task-count]').forEach(badge => {
      badge.hidden = !mineLeft;
      badge.textContent = mineLeft;
      badge.title = `${mineLeft} open today`;
    });
    if (!box) return;
    const shown = showAll ? tasks.filter(task => inScope(task, scope)) : todays(scope);
    const oneOffs = shown.filter(task => task.repeat === 'none');
    const groups = [
      ['Repeating', shown.filter(task => task.repeat !== 'none')],
      ['To do', oneOffs.filter(task => !showAll || !tickFor(task))],
      ['Done', showAll ? oneOffs.filter(tickFor) : []]
    ];
    const left = shown.filter(task => !tickFor(task)).length;
    document.getElementById('taskSummary').textContent = !shown.length ? ''
      : showAll ? `${shown.length} ${shown.length === 1 ? 'task' : 'tasks'}`
      : left ? `${left} of ${shown.length} left` : 'All done';
    const bar = document.getElementById('taskProgress');
    if (bar) {
      const done = shown.length - left;
      bar.hidden = !shown.length;
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuemax', String(shown.length));
      bar.style.setProperty('--done', shown.length ? done / shown.length : 0);
    }
    box.innerHTML = shown.length ? groups.filter(([, list]) => list.length).map(([title, list]) => `
      <div class="task-group"><h3>${title}</h3><ul class="task-list">${list.map(task => itemHtml(task)).join('')}</ul></div>`).join('')
      : `<p class="task-empty">${showAll ? 'No tasks yet. Add one' : 'No tasks for today. Add one'}, or switch to Whole team.</p>`;
    if (upcomingBox) {
      // Daily / weekday tasks would fill every day: list them once, then what else falls on each day.
      const mine = tasks.filter(task => inScope(task, scope) && task.start_date <= taskAddDays(taskToday(), 7));
      const routine = mine.filter(task => task.repeat === 'daily' || task.repeat === 'weekdays');
      const days = taskUpcoming(mine.filter(task => !routine.includes(task)), taskToday(), 7, task => ticks.some(tick => tick.task_id === task.id));
      upcomingBox.innerHTML = (routine.length ? `<div class="task-group"><h3>Every day or weekday</h3><ul class="task-list">${routine.map(task => itemHtml(task, true)).join('')}</ul></div>` : '')
        + (days.length ? days.map(([day, list]) => `
        <div class="task-group"><h3>${new Date(`${day}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
        <ul class="task-list">${list.map(task => itemHtml(task, true)).join('')}</ul></div>`).join('')
        : `<p class="task-empty">${routine.length ? 'Nothing else' : 'Nothing'} coming up in the next 7 days.</p>`);
    }
  }

  function openDialog(task) {
    editing = task || null;
    form.reset();
    document.getElementById('taskDialogTitle').textContent = task ? 'Edit task' : 'Add task';
    document.getElementById('taskDelete').hidden = !task;
    fields.assigned_to.innerHTML = '<option value="">Whole team</option>' + people.map(person => `<option value="${person.user_id}">${esc(person.name)}</option>`).join('');
    fields.title.value = task?.title || '';
    fields.details.value = task?.details || '';
    fields.assigned_to.value = task ? task.assigned_to || '' : me.id;
    fields.repeat.value = task?.repeat || 'none';
    fields.start_date.value = task?.start_date || taskToday();
    fields.priority.value = task?.priority || 'normal';
    fields.link.value = task?.link || '';
    document.getElementById('taskWatchers').innerHTML = people.map(person => `<label class="gm-check"><input type="checkbox" name="watchers" value="${person.user_id}"${task?.watchers?.includes(person.user_id) ? ' checked' : ''}> ${esc(person.name)}</label>`).join('');
    document.getElementById('taskWatchersPick').open = false;
    syncWatchers();
    syncDateLabel();
    document.getElementById('taskComments').hidden = !task;
    if (task) loadComments();
    dialog.showModal();
    fields.title.focus();
  }

  async function loadComments() {
    const list = document.getElementById('taskCommentList');
    list.innerHTML = '<li class="task-comment-empty">Loading…</li>';
    const { data, error } = await client.from('task_comments').select('*').eq('task_id', editing.id).order('created_at');
    if (error) {
      list.innerHTML = `<li class="task-comment-empty">${/does not exist|schema cache/i.test(error.message) ? 'Comments need a one-time database update: run supabase/notifications_tasks.sql.' : esc(error.message)}</li>`;
      return;
    }
    list.innerHTML = data.length ? data.map(comment => `
      <li><div class="task-comment-meta"><strong>${esc(nameOf(comment.author_id) === 'Someone' ? comment.author?.split('@')[0] : nameOf(comment.author_id))}</strong>
        <time datetime="${esc(comment.created_at)}">${new Date(comment.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time>
        ${comment.author_id === me.id ? `<button type="button" class="task-comment-delete" data-delete-comment="${comment.id}">Delete</button>` : ''}</div>
        <p>${esc(comment.body)}</p></li>`).join('') : '<li class="task-comment-empty">No comments yet.</li>';
  }

  async function addComment(event) {
    event.preventDefault();
    const field = event.target.elements.body;
    const body = field.value.trim();
    if (!body || !editing) return;
    const { error } = await client.from('task_comments').insert({ task_id: editing.id, body });
    if (error) { say(error.message, true); return; }
    field.value = '';
    // The person who made the task, the person it's for and its watchers hear about it (not you); tags as usual.
    const by = me.user_metadata?.full_name || me.email;
    const ids = [editing.created_by_id, editing.assigned_to, ...(editing.watchers || [])];
    window.portalNotify?.(ids, { kind: 'comment', title: `${by} commented on: ${editing.title}`.slice(0, 200), body: body.slice(0, 300), link: 'pages/Tasks.html' })
      .catch(err => console.warn(err.message));
    window.portalNotifyMentions?.(body, `a comment on "${editing.title}"`);
    commentCounts.set(editing.id, (commentCounts.get(editing.id) || 0) + 1);
    await loadComments();
    render();
  }

  async function deleteComment(id) {
    const { error } = await client.from('task_comments').delete().eq('id', id);
    if (error) { say(error.message, true); return; }
    commentCounts.set(editing.id, Math.max(0, (commentCounts.get(editing.id) || 1) - 1));
    await loadComments();
    render();
  }

  function syncWatchers() {
    const names = [...form.querySelectorAll('[name="watchers"]:checked')].map(box => box.parentElement.textContent.trim());
    document.getElementById('taskWatchersSummary').textContent = names.length ? names.join(', ') : 'Nobody';
  }

  function syncDateLabel() {
    document.getElementById('taskDateLabel').textContent = fields.repeat.value === 'none' ? 'Due date' : 'Starts';
  }

  async function save() {
    const row = {
      title: fields.title.value.trim(),
      details: fields.details.value.trim() || null,
      assigned_to: fields.assigned_to.value || null,
      repeat: fields.repeat.value,
      start_date: fields.start_date.value,
      priority: fields.priority.value,
      link: fields.link.value || null,
      watchers: [...form.querySelectorAll('[name="watchers"]:checked')].map(box => box.value)
    };
    const query = editing ? client.from('tasks').update(row).eq('id', editing.id) : client.from('tasks').insert(row);
    const { data, error } = await query.select('id');
    if (error || !data?.length) {
      say(error?.message || 'Not saved: only the person who made the task, or who it\'s for, can change it.', true);
      return;
    }
    const by = me.user_metadata?.full_name || me.email;
    if (row.assigned_to && row.assigned_to !== editing?.assigned_to) {
      window.portalNotify?.([row.assigned_to], { kind: 'task', title: `${by} gave you a task: ${row.title}`, body: row.details, link: 'pages/Tasks.html' })
        .catch(err => console.warn(err.message));
    }
    const newWatchers = row.watchers.filter(id => !editing?.watchers?.includes(id));
    if (newWatchers.length) {
      window.portalNotify?.(newWatchers, { kind: 'task', title: `${by} added you as a follower: ${row.title}`.slice(0, 200), link: 'pages/Tasks.html' })
        .catch(err => console.warn(err.message));
    }
    if (!editing && row.details) window.portalNotifyMentions?.(row.details, `the task "${row.title}"`);
    dialog.close();
    say(editing ? 'Task saved.' : 'Task added.');
    await load();
  }

  async function remove() {
    if (!editing || !confirm(`Delete "${editing.title}"? ${editing.repeat === 'none' ? '' : 'It stops repeating for everyone.'}`)) return;
    const { data, error } = await client.from('tasks').delete().eq('id', editing.id).select('id');
    if (error || !data?.length) {
      say(error?.message || 'Not deleted: only the person who made the task, or who it\'s for, can delete it.', true);
      return;
    }
    dialog.close();
    say('Task deleted.');
    await load();
  }

  async function toggle(input) {
    const task = tasks.find(item => item.id === +input.dataset.tick);
    const tick = tickFor(task);
    // Show the change straight away; reload from the database after (and undo it if it failed).
    ticks = tick ? ticks.filter(item => item !== tick) : [...ticks, { task_id: task.id, done_on: taskToday(), done_by: me.email }];
    render();
    const { error } = tick
      ? await client.from('task_done').delete().eq('task_id', task.id).eq('done_on', tick.done_on)
      : await client.from('task_done').insert({ task_id: task.id, done_on: taskToday() });
    if (error) say(error.message, true);
    await load();
  }

  async function quickAdd(event) {
    event.preventDefault();
    const input = event.target.elements.title;
    const title = input.value.trim();
    if (!title) return;
    input.disabled = true;
    const { error } = await client.from('tasks').insert({ title, assigned_to: me.id, repeat: 'none', start_date: taskToday() });
    input.disabled = false;
    if (error) { say(error.message, true); return; }
    input.value = '';
    input.focus();
    say(`Added "${title}" for today.`);
    await load();
  }

  function initList() {
    document.body.insertAdjacentHTML('beforeend', TASK_DIALOG);
    // Quick add (a one-off for you, due today) and, on Home, today's progress bar.
    box.insertAdjacentHTML('beforebegin', `
      <form class="task-quick" id="taskQuick">
        <label class="sr-only" for="taskQuickTitle">New task for today</label>
        <input id="taskQuickTitle" name="title" type="text" maxlength="200" autocomplete="off" placeholder="Add a task for today, then press Enter">
        <button type="submit" class="sop-action-button secondary">Add</button>
      </form>
      ${showAll ? '' : '<div class="task-progress" id="taskProgress" role="progressbar" aria-label="Tasks done today" aria-valuemin="0" hidden><span></span></div>'}`);
    document.getElementById('taskQuick').addEventListener('submit', quickAdd);
    dialog = document.getElementById('taskDialog');
    form = document.getElementById('taskForm');
    fields = form.elements; // not form.title: that is the form's own title attribute
    [box, upcomingBox].filter(Boolean).forEach(list => {
      list.addEventListener('change', event => { if (event.target.dataset.tick) toggle(event.target); });
      list.addEventListener('click', event => {
        const edit = event.target.closest('[data-edit]');
        if (edit) openDialog(tasks.find(task => task.id === +edit.dataset.edit));
      });
    });
    document.getElementById('taskAdd').addEventListener('click', () => openDialog());
    document.getElementById('taskCancel').addEventListener('click', () => dialog.close());
    document.getElementById('taskDelete').addEventListener('click', remove);
    fields.repeat.addEventListener('change', syncDateLabel);
    document.getElementById('taskWatchers').addEventListener('change', syncWatchers);
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
      scope = button.dataset.scope;
      document.querySelectorAll('[data-scope]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      render();
    }));
    // The menu's "Add a task" link (pages/Tasks.html#new) opens the dialog, also when already on this page.
    const openFromHash = () => {
      if (location.hash !== '#new') return;
      history.replaceState(null, '', location.pathname + location.search);
      openDialog();
    };
    window.addEventListener('hashchange', openFromHash);
    document.getElementById('taskCommentForm').addEventListener('submit', addComment);
    document.getElementById('taskCommentList').addEventListener('click', event => {
      const id = event.target.closest('[data-delete-comment]')?.dataset.deleteComment;
      if (id && confirm('Delete this comment?')) deleteComment(+id);
    });
    // For keyboard shortcuts (js/siteMenu.js): N adds a task, T opens or closes the panel.
    window.portalTasks = { add: () => openDialog(), toggle: () => document.getElementById('taskTab')?.click() };
    return openFromHash;
  }

  (async () => {
    await window.authReady;
    client = window.supabaseClient;
    me = client && (await client.auth.getSession()).data.session?.user;
    if (!me) return;
    const openFromHash = box && initList();
    // notifications.js (loaded by auth.js) owns the people list; fall back to the RPC if it isn't in yet.
    people = await (window.portalPeople ? window.portalPeople() : client.rpc('portal_people').then(r => r.data || [])).catch(() => []);
    await load();
    openFromHash?.();
    // Once a day per browser: alert me about my one-off tasks due today or overdue (the database
    // skips any it already sent today).
    let checked = '';
    try { checked = localStorage.getItem('portal-due-checked'); } catch {}
    if (checked !== taskToday()) {
      const { data, error } = await client.rpc('notify_my_due_tasks');
      if (!error) try { localStorage.setItem('portal-due-checked', taskToday()); } catch {}
      if (data > 0) window.dispatchEvent(new Event('portal-notifications')); // refresh the bell now
    }
  })();
}

// auth.js loads this file while the page may still be parsing.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', taskInit);
  else taskInit();
}

if (typeof module !== 'undefined') module.exports = { taskIsOn, taskDaysLate, taskUpcoming, taskOrder };
