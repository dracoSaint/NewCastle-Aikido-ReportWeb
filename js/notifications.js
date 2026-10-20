// Notification centre (bell in the header), @mentions in notes, and the people list both use.
// Loaded by js/auth.js on every signed-in page. Tables: supabase/notifications_tasks.sql.
//
// Pages: add data-mention to a textarea or input for @ suggestions, then after saving call
// portalNotifyMentions(text, 'a Red / Orange note'). portalNotify(userIds, {...}) sends anything else.
(function () {
  const siteRoot = new URL('../', document.currentScript.src);
  const client = window.supabaseClient;
  if (!client) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const handle = person => person.email.split('@')[0].toLowerCase();
  const meReady = client.auth.getSession().then(({ data }) => data.session?.user || null);
  let peopleReady = null;

  window.portalPeople = () => peopleReady ||= client.rpc('portal_people').then(({ data, error }) => {
    if (error) { peopleReady = null; throw error; }
    return data || [];
  });

  // This page as a portal link ("pages/REPORTs/FollowUpReport.html"); the database only accepts portal links.
  // Pretty-URL hosts (Cloudflare Pages) drop ".html" ("/pages/Tasks", "/"): put it back.
  const here = () => {
    const path = location.pathname.slice(new URL(siteRoot).pathname.length).replace(/\/$/, '');
    return !path || path === 'index' ? 'index.html' : path.endsWith('.html') ? path : `${path}.html`;
  };

  window.portalNotify = async (userIds, { kind = 'mention', title, body = null, link = here() }) => {
    const me = await meReady;
    const rows = [...new Set(userIds)].filter(id => id && id !== me?.id).map(user_id => ({ user_id, kind, title, body, link }));
    if (!rows.length) return 0;
    const { error } = await client.from('notifications').insert(rows);
    if (error) throw error;
    return rows.length;
  };

  // On an edit, pass the old text: only people newly tagged get an alert.
  const tagsIn = text => new Set((String(text || '').match(/@[a-z0-9._+-]+/gi) || []).map(tag => tag.slice(1).toLowerCase().replace(/\.$/, '')));
  window.portalNotifyMentions = async (text, where, before = '') => {
    const old = tagsIn(before);
    const tags = new Set([...tagsIn(text)].filter(tag => !old.has(tag)));
    if (!tags.size) return 0;
    try {
      const [people, me] = await Promise.all([window.portalPeople(), meReady]);
      // A tag matches the email name (what the list inserts), the first name, or the full name without spaces.
      const names = person => [handle(person), person.name.split(/\s+/)[0].toLowerCase(), person.name.replace(/\s+/g, '').toLowerCase()];
      const ids = people.filter(person => names(person).some(name => tags.has(name))).map(person => person.user_id);
      const name = me?.user_metadata?.full_name || me?.email || 'Someone';
      return await window.portalNotify(ids, { title: `${name} tagged you in ${where}`, body: String(text).slice(0, 300) });
    } catch (error) {
      console.warn('Could not send tag notifications:', error.message);
      return 0;
    }
  };

  // ── @ suggestions in any textarea or input with data-mention ──────────────────────────────────────────────
  const list = document.createElement('ul');
  list.className = 'mention-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  let field = null;
  let matches = [];
  let active = 0;

  function closeList() { list.hidden = true; field = null; }

  async function suggest(target) {
    const before = target.value.slice(0, target.selectionStart);
    const query = before.match(/(?:^|\s)@([a-z0-9._+-]*)$/i)?.[1]?.toLowerCase();
    if (query === undefined) return closeList();
    const people = await window.portalPeople().catch(() => []);
    matches = people.filter(p => handle(p).includes(query) || p.name.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) return closeList();
    field = target;
    active = 0;
    renderList();
    const box = target.getBoundingClientRect();
    // Inside an open <dialog> (top layer), or it would sit behind it.
    const host = target.closest('dialog') || document.body;
    if (list.parentElement !== host) host.append(list);
    Object.assign(list.style, { left: `${box.left}px`, top: `${box.bottom + 4}px`, minWidth: `${Math.min(box.width, 280)}px` });
    list.hidden = false;
  }

  function renderList() {
    list.innerHTML = matches.map((p, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}"><strong>${esc(p.name)}</strong><span>@${esc(handle(p))}</span></li>`).join('');
  }

  function pick(person) {
    const at = field.selectionStart;
    const start = field.value.slice(0, at).lastIndexOf('@');
    const tag = `@${handle(person)} `;
    field.value = field.value.slice(0, start) + tag + field.value.slice(at);
    field.selectionStart = field.selectionEnd = start + tag.length;
    field.focus();
    closeList();
  }

  document.addEventListener('input', event => { if (event.target.matches?.('[data-mention]')) suggest(event.target); });
  document.addEventListener('focusout', event => { if (event.target === field) setTimeout(closeList, 150); });
  window.addEventListener('scroll', () => { if (field) closeList(); }, { passive: true });
  list.addEventListener('mousedown', event => {
    const item = event.target.closest('li');
    if (!item || !field) return;
    event.preventDefault();
    pick(matches[+item.dataset.i]);
  });
  // Capture phase, so Enter / Escape pick or close the list before the page's own shortcuts run.
  document.addEventListener('keydown', event => {
    if (list.hidden || event.target !== field) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      active = (active + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      renderList();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(matches[active]);
    } else if (event.key === 'Escape') {
      closeList();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // ── Bell ──────────────────────────────────────────────────────────────────────────────────────
  function timeAgo(stamp) {
    const minutes = Math.round((Date.now() - new Date(stamp)) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
    return new Date(stamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  function initBell() {
    const brand = document.getElementById('siteBrand');
    if (!brand || document.getElementById('notifyBtn')) return;
    brand.querySelector('#profileDropdownWrap')?.insertAdjacentHTML('beforebegin', `
      <div class="notify-wrap">
        <button class="notify-btn" id="notifyBtn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="notify-count" id="notifyCount" hidden></span>
        </button>
        <div class="profile-dropdown-menu notify-panel" id="notifyPanel" role="region" aria-label="Notifications" hidden>
          <div class="notify-head"><strong>Notifications</strong><button type="button" class="notify-all" id="notifyAll">Mark all read</button></div>
          <ul class="notify-list" id="notifyList"><li class="notify-empty">Loading…</li></ul>
        </div>
      </div>`);
    const btn = document.getElementById('notifyBtn');
    const panel = document.getElementById('notifyPanel');
    if (!btn) return;
    let rows = [];

    async function load() {
      const { data, error } = await client.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
      if (error) {
        document.getElementById('notifyList').innerHTML = `<li class="notify-empty">${/does not exist|schema cache/i.test(error.message) ? 'Run supabase/notifications_tasks.sql in Supabase first.' : 'Could not load notifications.'}</li>`;
        return;
      }
      rows = data;
      const unread = rows.filter(row => !row.read_at).length;
      const count = document.getElementById('notifyCount');
      count.hidden = !unread;
      window.dispatchEvent(new CustomEvent('portal-unread', { detail: unread })); // sidebar Today card
      count.textContent = unread > 9 ? '9+' : unread;
      btn.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
      document.getElementById('notifyAll').hidden = !unread;
      document.getElementById('notifyList').innerHTML = rows.length ? rows.map(row => `
        <li><a class="notify-item${row.read_at ? '' : ' is-unread'}" href="${esc(new URL(row.link || 'index.html', siteRoot).href)}" data-id="${row.id}">
          <strong>${esc(row.title)}</strong>${row.body ? `<span>${esc(row.body)}</span>` : ''}
          <time datetime="${esc(row.created_at)}">${timeAgo(row.created_at)}</time>
        </a></li>`).join('') : '<li class="notify-empty">Nothing yet. @mentions and tasks given to you show up here.</li>';
    }

    async function markRead(ids) {
      if (!ids.length) return;
      await client.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    }

    btn.addEventListener('click', event => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) load();
    });
    document.addEventListener('click', () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
    panel.addEventListener('click', async event => {
      event.stopPropagation();
      if (event.target.closest('#notifyAll')) {
        await markRead(rows.filter(row => !row.read_at).map(row => row.id));
        return load();
      }
      const item = event.target.closest('.notify-item');
      if (item?.classList.contains('is-unread')) {
        event.preventDefault();
        await markRead([+item.dataset.id]);
        location.href = item.href;
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    window.addEventListener('portal-notifications', load); // another script just sent me one
    // ponytail: polls every 2 min; switch to Supabase Realtime if alerts need to be instant.
    setInterval(() => { if (!document.hidden) load(); }, 120000);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBell);
  else initBell();
})();
