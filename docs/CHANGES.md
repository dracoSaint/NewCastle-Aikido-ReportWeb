# Changes

What each feature does, where it lives, and how to check it. Newest first. Session history and open
items are in `docs/WORKLOG.md`.

---

## Cloudflare Pages hosting (2026-10-21, not yet shipped)

Moving the site from Netlify to Cloudflare Pages. The site is static (no server code); the bots stay on GitHub Actions and the data stays in Supabase, so neither changes.

**Code changes (work on both hosts):**
- Cloudflare serves `/pages/Tasks.html` as `/pages/Tasks` (308 redirect; query strings kept). Three checks assumed ".html" and now accept both: the No access page (`js/access.js`), the menu's current-page highlight and Recent (`js/siteMenu.js`), and the page link stored on @mention alerts (`js/notifications.js`; the database only accepts `….html` links).
- `npm run build` copies only the site (`index.html`, `css`, `js`, `imgs`, `pages`, `_headers`) into `dist/`, so `automation/`, `docs/`, `supabase/` and `CLAUDE.md` are not published.
- `_headers`: nosniff, `X-Frame-Options: SAMEORIGIN` (the SOP Library frames its own pages), referrer and permissions policies.
- `npm run preview` builds and serves `dist/` with Cloudflare's own dev server (Wrangler) on http://127.0.0.1:8788, pretty URLs included. `.claude/preview-shots.mjs` takes `BASE=http://127.0.0.1:8788/`.

**Set-up (once, in this order):**
1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > pick `dracoSaint/NewCastle-Aikido-ReportWeb`.
2. Build settings: Framework preset None; Build command `npm run build`; Build output directory `dist`; Root directory empty. **Production branch `production`** (Netlify keeps publishing `main`; both stay live). No environment variables are needed (the Supabase URL and publishable key are public, in `js/config.js`).
3. Preview deployments: set to "None" or "Custom: testing" so pushes to `main` / `staging` don't use up Cloudflare builds. Branch flow: `testing` → `main` (Netlify) → `production` (Cloudflare): `git push origin main:production` once main is checked.
4. Supabase > Authentication > URL Configuration:
   - Add to Redirect URLs: `https://<project>.pages.dev/**` and `https://*.<project>.pages.dev/**` (and the custom domain below, if any). Without this, password reset and invite links fail.
   - Change Site URL to the Cloudflare address only when you switch over for good (it is where sign-up / invite emails send people).
5. Optional custom domain: Pages project > Custom domains > Set up a domain (DNS on Cloudflare is easiest), then add it to Supabase Redirect URLs too.
6. Test the `pages.dev` site: sign in, open each report, tick a task, tag someone, reset a password.
7. Netlify stays on (decision 2026-10-21). Keep the Supabase Site URL on the Netlify address until staff move over; then change it to the Cloudflare one.

**Known limits:** a push to `main` builds on Netlify only; a push to `production` builds on Cloudflare only (500 builds a month on the free plan). Bookmarks with `.html` keep working on Cloudflare (they redirect).

---

## Sidebar Today card and Recent pages (2026-10-21, not yet shipped)

- The empty space under the sidebar menu now holds:
  - **Today card:** the date; My tasks today (done / total, green bar; click opens the TASKS panel, or the Tasks page there); Unread alerts (red when any; click opens the bell); Past Due follow-ups due today or overdue (shown only when a task that opens Past Due has loaded them; click opens the report).
  - **Recent:** the last 4 menu pages you opened (this browser only). Hidden on short screens (under 760 px tall).
- Both hide when the sidebar is collapsed to icons. The menu no longer shrinks: on small screens the whole sidebar scrolls.
- **Files:** `js/siteMenu.js`, `js/notifications.js` (`portal-unread` event), `js/tasks.js` (`portal-pastdue` event), `css/styles.css`.
- **Check:** open a few reports, then look at Recent; tick a task and watch the bar; click Unread alerts.

---

## Task page links and Past Due follow-ups in the task list (2026-10-21, not yet shipped)

- **Opens:** a task can open a report (Edit task > Opens: Past Due, Red / Orange, Monday Board, Ad Review, Geronimo, Grading, SOP Library). The task shows "Open <report> →". Meant for repeating tasks such as "Check the Red / Orange list".
- **Past Due follow-ups:** under a task that opens Past Due Members, today's list shows the members whose follow-up is overdue, due today or due in the next 3 days (soonest first; up to 8, then "+N more"): name, balance owing, when, and the SOP step. Same rule as the report's Next follow-up column (now shared: `pastDueMemberFollowUp` and `pastDueOpenMembers` in `js/pastDueCore.js`). Only for roles that can view Past Due.
- **Member links:** clicking a member opens Past Due Members on the Past Due tab, already searched to that name (`PastDueMembers.html?member=<name>`).
- Home's Past due tile uses the same shared `pastDueOpenMembers`.

**Files:** `js/tasks.js`, `js/pastDueCore.js`, `js/pastDueMembers.js`, `js/homeGlance.js`, `supabase/notifications_tasks.sql` (section 4: `tasks.link`), `css/styles.css`, `automation/pastdue-core.check.mjs`.

**Set-up:** re-run `supabase/notifications_tasks.sql` (adds the `link` column; saving a task fails until then).

**Check:** `node automation/pastdue-core.check.mjs`. Make a weekday task "Past Due follow-ups" that opens Past Due Members; open the TASKS tab: the members due show under it; click one.

---

## Task alerts, priority, comments; Home at a glance; menu collapse; shortcuts (shipped 2026-10-20, 50e4b5f)

- **Due alerts:** the first time you open the portal each day, your bell gets one alert per one-off task assigned to you that is due today or overdue and not done (`notify_my_due_tasks()`; never twice a day).
- **Done alerts:** ticking off a task someone else made sends them "<name> finished: <task>" (database trigger on `task_done`).
- **Priority:** Normal / High in the task box. High tasks show a red HIGH label and sit first; then by due / start date (overdue first).
- **Comments:** the Edit task box has a comment thread (`task_comments`) with @tags. A comment alerts the task's maker and the person it's for. Task rows show "2 comments". You can delete only your own.
- **Home at a glance:** four live tiles, each linking to its report: Members this week (+/- vs last week), Red / Orange to call (orange, red and no record, as the report counts them), Past due (total of PAST DUE bills, exempt members left out, as the page), My tasks today (done / total). Tiles for reports your role can't open are hidden.
- **Collapsible sidebar (wide screens):** the button next to Settings shrinks the menu to icons (hover shows the name); remembered in this browser.
- **Keyboard shortcuts:** T tasks panel, N add a task, M menu, / or Ctrl K find a page, ? shows the list. Ignored while typing.
- **Audit fixes:** task initials were split on the letter s (fixed); comment box padding; TASKS tab sits lower on phones so it covers less; every page checked at 1440 and 390 px: no errors, no sideways scroll.

**Files:** `supabase/notifications_tasks.sql` (section 3), `js/tasks.js`, `js/homeGlance.js` (new), `js/siteMenu.js`, `js/notifications.js`, `index.html`, `css/styles.css`, `automation/tasks.check.mjs`.

**Set-up:** re-run `supabase/notifications_tasks.sql` (adds priority, comments, the two alert functions). Until then saving a task fails on the priority column.

**Check:** `node automation/tasks.check.mjs`. Give a colleague a task due today: next day they open the portal they get a Due alert; when they tick it you get a Done alert. Comment on a task. Press ? on any page.

---

## TASKS slide-out (shipped 2026-10-20, 50e4b5f)

- Home no longer has a Today's tasks section. Instead every page (except the Tasks page) has a dark **TASKS** tab on the right edge with the open-today count. Clicking it slides out today's list from the right: tick off, quick add, Mine / Whole team, Add task, Edit, and a link to all tasks.
- It stays open as you move between pages (remembered in this browser) until you close it (× or Esc). On phones it covers the screen, so there it always starts closed.
- **Files:** `js/tasks.js` (panel markup + open/close), `index.html`, `css/styles.css`.
- **Check:** open the tab on any report, go to another page: it is still open; tick a task there.

---

## Sidebar menu and Tasks page (shipped 2026-10-20, 50e4b5f)

- **Sidebar (every page with the menu):** screens 1100 px and wider show a fixed left sidebar (264 px) instead of the burger. It has the logo, Home, then the TASKS, REPORTS and SOP categories, which open and close like an accordion; Settings is at the bottom. Every page has an icon, and the current page is highlighted. Which categories are open is remembered in that browser; the current page's category always opens. On narrower screens the same sidebar slides out from the menu button (Esc, ×, or a tap outside closes it).
- **Task count:** the Task list link shows a red count of your tasks still open today (yours + whole team), on every page.
- **Tasks page (`pages/Tasks.html`):** All tasks: Repeating (every repeating task; a tick box only on the days it is on), To do (every open one-off, any due date) and Done (ticked one-offs, with date and who). Then Next 7 days (repeating tasks on their days, one-off tasks on their due date). "Add a task" in the menu opens the Add task box there (`Tasks.html#new`). Home links to it ("All tasks"). Task notifications open the Tasks page.
- **Home: today only:** repeating tasks that are on today, plus one-off tasks due today or overdue. One-offs due later only show on the Tasks page.
- The task dialog markup lives in `js/tasks.js` (one copy for both pages). `js/auth.js` loads `js/tasks.js` on every signed-in page.

- **Polish (same day):** quick add box (type, Enter: a one-off for you, due today; Add task still opens the full dialog); a green progress bar for today on Home; ticks show instantly; each task shows who it is for as initials (All = whole team); Next 7 days lists daily / weekday tasks once ("Every day or weekday") instead of under every day.

**Files:** `js/siteMenu.js`, `js/tasks.js`, `js/auth.js`, `pages/Tasks.html` (new), `index.html`, `css/styles.css`, `automation/tasks.check.mjs`, `.impeccable/config.json`, `.claude/preview-shots.mjs`.

**Check:** `node automation/tasks.check.mjs`. On a laptop: the sidebar is always open; open/close REPORTS and SOP, reload (it remembers). On a phone: the menu button opens it. Open Tasks: Today matches Home; Next 7 days lists what's coming.

**Known limits:** the count refreshes on page load and after ticking, not live.

---

## Notification centre, @mentions and Home tasks (shipped 2026-10-20, 50e4b5f)

- **Bell (every signed-in page):** next to the profile button. A red count shows unread alerts. The panel lists the latest 30; clicking one marks it read and opens its page. "Mark all read" clears the count. Refreshes every 2 minutes and when the tab comes back into view.
- **@mentions:** a tag matches the email name, first name or full name without spaces (`@leisa`, `@leisagraham`). Type `@` in a Red / Orange member note, a Past Due member note or a task's details. A list of people appears (arrow keys + Enter or Tab, or click). Works in every note box: the add-note boxes, the one-line top note and the Log contact note on Red / Orange, and the note edit boxes on both pages. Saving sends each tagged person a notification with the note text; an edit only alerts people newly tagged.
- **Today's tasks (Home):** between Start here and the report list.
  - **Repeating** (daily, weekdays Mon–Fri, weekly on the start date's weekday, monthly on its date or the month's last day): tick per day; tomorrow it comes back unticked.
  - **To do** (one-off): stays until ticked, with due today / due date / days overdue (red).
  - Mine (yours + whole-team tasks) or Whole team. Add task / Edit opens a dialog: task, details, for (a person or whole team), repeats, due / start date, Delete.
  - Giving a task to someone else sends them a notification.
- **Rules (database):** you only read, mark or clear your own notifications; the sender is stamped; links only point inside the portal. Everyone reads tasks; the creator, the assignee or a user admin (`access.manage`) can change or delete one; anyone can tick or untick. Tasks are in the audit log.

**Files:** `supabase/notifications_tasks.sql` (new), `js/notifications.js` (new), `js/tasks.js` (new), `automation/tasks.check.mjs` (new), `index.html`, `js/auth.js`, `js/followUpReport.js`, `js/pastDueMembers.js`, `js/settings.js`, `css/styles.css`.

**Set-up:** run `supabase/notifications_tasks.sql` in the Supabase SQL editor (safe to re-run).

**Check:** `node automation/tasks.check.mjs`. On Home: add a task for yourself (shows under To do), tick it, add a daily one. Give one to a colleague, and tag them (`@name`) in a Red / Orange note; their bell shows 1.

**Known limits:** alerts arrive within 2 minutes, not instantly. A tagged person sees the note text in the alert even without access to that report. Only the Red / Orange and Past Due notes logs and task details take tags (not the one-line top note).

---

## Site UI/UX pass (shipped 2026-10-20, 50e4b5f)

An audit of every page at 1440 and 390 px (no console errors or sideways scroll anywhere), then the fixes chosen by the user.

- **Tab bars (all pages, phones):** the right-edge fade showing more tabs is wider (96px), so a cut-off tab clearly reads as scrollable.
- **Grading:** Eligibility / Enough attendance show chips (green Eligible / Yes, grey Not eligible / No). On phones each member is a compact card: name and chip on one line, then the four figures. The page is 6,910 → 5,125 px.
- **Red / Orange Follow-Up (phones):** tier cards are compact (name + phone on one line without labels; last class, days and contact side by side; no Note label). Each row is 315 → about 225 px; the page is 11,439 → 9,454 px.
- **Daily Ad Review (phones):** Copy for Slack sits under the Executive summary heading instead of on top of it.
- **Design-check warnings:** the Ad Review contrast warnings were a false positive (the dashed heading rule is a background-image; the text is on white), suppressed for that file. Cramped-padding on Ad Review / Monday Board was left unsuppressed (static scan of empty cards; a whole-file ignore would hide real ones). Nested-cards (Monday upload dialog), body clipped-overflow and design-system-radius were left as they were (pre-existing).
- `.claude/preview-shots.mjs`: viewport shots now follow PRE scrolling.

**Files:** `css/styles.css`, `js/gradingScripts.js`, `.impeccable/config.json`, `.claude/preview-shots.mjs`.

**Check:** on a phone, open Grading, Red / Orange Follow-Up and Daily Ad Review; swipe the tab bar (the fade shows there are more tabs).

---

## Monday Board: All Members tab (shipped 2026-10-19, b0b80e5)

Every Zen Planner membership in any status (current, not started, hold, cancel pending, cancelled, completed): about 3,100 rows, one per membership.

- **Data:** the nightly Zen Planner job exports Zen Planner's membership grid (the user's report URL) and saves it to `membership_all`.
  - Upsert by membership number, then remove rows the export no longer has.
  - Removal is skipped when the export is under 90% of the rows on file, so a bad export never wipes the list.
- **Tab:** Monday Board > All Members. Filtering, sorting, counting and paging run in the database (50 per page), so the page never loads all rows.
  - Status tiles with counts (they follow the other filters); click one to filter by it.
  - Filters: search (each word matches first name, last name or number), status, membership (including "(no membership name)" for old memberships), autopay, Begins/Ends date range, sort.
  - Clear filters; Export CSV exports every matching row, not just the page. Cells are quoted and formula-safe.
  - "Updated from Zen Planner …" shows the last sync.
- Loads the first time the tab is opened.

**Files:** `js/allMembers.js`, `pages/REPORTs/MondayBoardReport.html`, `css/styles.css` (`.am-status`, `.am-pager`), `supabase/membership_all.sql`, `automation/zenplanner-followup.mjs` (`allMemberships`, `saveAllMemberships`), `js/mondayBoardScripts.js` (one line so `loadMondayTab` leaves the tab to `allMembers.js`).

**Set up (once):** run `supabase/membership_all.sql` in the Supabase SQL editor. The next nightly run fills it (or run the follow-up bot by hand from Settings > Bots).

**Check**
- Bot dry run on 2026-10-19: `All memberships: not saved (DRY_RUN): 3137 memberships`.
- After the first run: All memberships ≈ 3,137 (Current 198, Completed 1,619, Cancelled 1,289, Hold 15, Not started 15, Cancel pending 1).
- Search "smith", pick Status = Cancelled, Ends this month: the count and pages follow; Export CSV gives the same count.

**Known limits**
- Attendance limit and people count are left out: they are blank / always 1 in the export.
- Updated nightly, not live.

---

## Daily Ad Review: traffic campaigns (shipped 2026-10-19, b0b80e5)

Traffic (link click) campaigns sit beside the lead-form ads without skewing the lead figures.

- **Campaign type** per ad (`ad_review_ads.campaign_type`: `leads` default, or `traffic`).
  - Set on import: Meta's "Result indicator" is not a lead result, or the campaign name contains "traffic".
  - Ad Hub > ad details > Campaign type changes it by hand. An import that says traffic moves the ad back to Traffic.
- **Daily Report:** a Lead ads / Traffic ads switch (two tiles with counts) above the tables.
  - Lead ads: the Threshold met / Under threshold tables, as before, without traffic ads.
  - Traffic ads: impressions, CTR (All), CTR (LCT), link clicks (impressions × CTR (LCT)), cost per click, spent.
- **Totals:** "Spend · last 7 days" includes traffic ("incl. $X traffic"). Leads, blended CPL, average CTR, the summary and the verdicts use lead ads only.
  - The summary gets a "Traffic campaign" line; Copy for Slack gets a Traffic Campaign line and a TRAFFIC ADS block.
  - Ad Hub: total spend includes traffic; leads, CPL and the decision counts don't. Traffic ads show "Traffic campaign" with clicks and cost per click instead of a lead diagnosis.
- Geronimo Metrics "Facebook budget spent" already sums every ad, so it includes traffic.

**Files:** `js/adReview.js` (`arIsTraffic`, `arClicks`, `arTrafficFor`, `arTrafficRowsHtml`), `pages/REPORTs/DailyAdReview.html`, `css/styles.css` (`.ar-kind-tabs`), `supabase/ad_review.sql` (column).

**Set up (once):** re-run `supabase/ad_review.sql` in the Supabase SQL editor (adds the column; safe to re-run). Before that, the page treats every ad as a lead ad, and importing a traffic campaign fails.

**Check**
- Daily Report shows "7 Lead ads · 0 Traffic ads" on 16 Oct; Traffic shows the empty message.
- Ad Hub > open an ad > Campaign type = Traffic: it moves to the Traffic tab, spend stays the same, leads and CPL drop its figures.
- Import a traffic campaign export: its ads land on the Traffic tab.

**Known limits**
- Link clicks are worked out from CTR (LCT) × impressions, so they can be off by a click or two.
- Trends and Monthly Review still mix traffic ads into "all ads" (their CPL includes traffic spend); pick a campaign to separate them.

---

## Geronimo Metrics Report (shipped 2026-10-19, b0b80e5)

Replaces the "2026 Newcastle Aikido GRN_Metrics" Google Sheet. Menu: REPORTS → Geronimo Metrics Report.

**Tabs**
- **Weekly**
  - One column per week ending Friday, newest first, with KPI tiles for the chosen week.
  - Entered fields: rolling 30-day revenue, autopay and suspended members, Facebook spend, Meta and organic leads, Intro + Pack sales, membership sales, sales value, rollovers, rollover %, attendance, weekly cancels and cancels this month.
  - Worked out on the page (the sheet's formulas):
    - Average cost per lead = Facebook spend ÷ Meta leads
    - Sales conversion = (Intro + Pack sales + membership sales) ÷ (Meta + organic leads); target 30%
    - Average visits = attendance ÷ autopay members; target 3–4
    - Churn = cancels this month ÷ autopay members; target 5% or less
    - Net gain = membership sales + rollovers − weekly cancels
  - **Week to date:** the current week (and last week until it locks) is worked out live from the other reports each time the page opens, marked "to date". Anything saved for that week (by hand or by the bot) wins over the live figure.
  - **Lock-in:** each night the bot fills the empty boxes of the two finished weeks before this one from the same figures and sets `locked_at` the first time ("locked" in the table). Saved figures never change; a late figure (e.g. rollover %) can still fill a blank.
  - **Edit** (any week, locked or not) opens the form with the saved figures; empty boxes get the app's figure, tagged "from the app". On an open week those stay live unless changed (only what you type is saved); on a closed week saving stores them. The calculations are in `js/geronimoCore.js`, shared by the page and the bot:
    - Scoreboard: organic leads; rolling 30-day revenue = average of the days entered that week; fallbacks for rollovers, memberships and cancels
    - Autopay members = Zen Planner's autopay report: memberships with autopay ON and status Current, Not started, Hold, Cancelled or Cancel pending (counted from `membership_all`, synced nightly). That table is today's list only, so it is used for this week and last week; older weeks use the Monday Board weekly log total. On 2026-10-19: 189 (the Monday total was 163)
    - Monday Board member lists (`membership_data_log` weekly snapshots + `membership_data`), matched by member **name** because `number` is each membership's own id:
      - Suspended = HOLD count on that week's Monday list
      - Intro + Pack sales = beginner packages created that week (the 5 Monday Board packages)
      - Membership sales = people first seen after the oldest list, with no package, whose first full membership (not Gratis) was created that week
      - Rollovers = a package holder's full membership created that week. Beginner Adult only follows BECOME Adult, so a Beginner Adult with no package on file (BECOME ended before the oldest list) is a rollover, never a sale. Beginner Adult → Regular Adult is a promotion: not counted.
      - Rollover % = packages that ended that week and rolled over, once a Monday list a week later exists
      - Sales value = package fee per intro pack + one week's fee per new membership (Monday Board > Pricing Settings); rollovers not included
    - Daily Ad Review: Meta leads (lead count); Facebook spend = the Ad Review's latest import dated in that week (Meta's rolling last 7 days, every ad including traffic). Before the week's first import, the current week uses the latest earlier import (noted); a finished week with no import of its own stays blank
    - Nightly bot (no button needed): attendance and cancels (see below)

    It skips any source the role can't read.
  - Extra row "Expected 30 day revenue (Monday Board × pricing)": members per category × weekly fee × 30/7. Reference only, not stored.
  - **From the other reports** card for the chosen week (live, nothing stored), numbers coloured red (Red list), amber (Orange, past due owing) or green (returns, bills cleared): Red and Orange counts (separate tiles) and returns, new and cleared past due bills (import runs), past due owing (current week only), ads delivering, and the ad with most leads (its lead count, name in the label). Each tile needs that report's view switch.
- **Trial waves:** people per month: induction date, inducted, name, email, phone, goal, why, notes and rolled over. Rollover % against the 80% target. Add, edit and remove are in a dialog; Rolled over can be changed in the table.
  - **Automatic every night** (Zen Planner job, `gmSyncWaves` in `js/geronimoCore.js`). The source is `membership_all` (every membership in any status), so Not started packages are included. Every beginner package beginning on or after 2026-01-01 joins the wave of the month it begins (one row per package, never duplicated). It fills blanks only:
    - Rolled over: yes if the same person (by name) has a full membership (not Gratis) beginning on or after the package; no if the package is completed or cancelled without one; blank while it is running.
    - Inducted: ticked once the package has begun and is current, on hold or completed. It is never unticked, so an untick on a started package comes back.
    - Email and phone: from the Daily Ad Review lead with that name; phone also from the latest Red / Orange attendance export.

    Anything staff typed is kept. **Update from member list** runs the same sync immediately.
  - **Colours and filters:** Rolled over shows green Yes, red No, amber In progress (the picker takes its answer's colour; read-only roles see chips). Inducted shows an Inducted / Not yet chip. The tiles (Rollover %, Rolled over, Did not roll over, In progress, Not inducted yet) are filters: click to show only those, click again to clear. Find searches name, phone and email.
  - **Edit** button on every row (and clicking the name) opens the form to change name, induction date, inducted, email, phone, goal, why, notes, rolled over, or remove the person.
- **Scoreboard:** one row per day: rollovers, memberships, organic leads, cancels, kickstarts, and the rolling 30-day revenue from the bank. Each box saves when you tab out. Net = rollovers + memberships − cancels, with month totals; revenue shows the month's average.

**Nightly bot** (`automation/zenplanner-followup.mjs`, after the Red / Orange report)
- Attendance: opens Zen Planner Attendance "on or after" the week's Saturday (attendances only, totals by program) and saves the Total to `geronimo_weekly.attendance` for the week ending Friday. It reruns each night, so the current week stays up to date.
- Cancels: exports Members > Drops (its CSV ignores the date filter, so dates are checked in code) and saves the week's and the month's counts (`weekly_cancels`, `cancels_mtd`) by Cancel Date. Not counted: reason "Membership Upgrade" or "Administrative Drop", beginner packages (`BEGINNER_PACKAGE_LABELS` from `js/mondayImportCore.js`) and Gratis. Drops with a blank membership label count.
- Writes only those columns; a failure only logs a warning and never stops the Red / Orange report.

**Files**
- `pages/REPORTs/GeronimoMetrics.html`: the page.
- `js/geronimoMetrics.js`: the page logic. `GM_ROWS` defines the weekly rows and formulas.
- `css/styles.css`: the "Geronimo Metrics Report" block at the end.
- `supabase/geronimo_metrics.sql` creates three tables: `geronimo_weekly` (key `week_ending`, a Friday), `geronimo_wave_members` and `geronimo_scoreboard` (key `day`). It also sets up:
  - an updated-by stamp
  - access rules: signed-in staff, narrowed by `geronimo.view` / `geronimo.edit`
  - audit-log triggers
  - Owner, Staff and Bot switches on first run (Bot saves attendance and cancels)
  - `geronimo_wave_members.member_number` (unique per wave), `geronimo_scoreboard.revenue_30d`, `geronimo_weekly.locked_at`
  - Bot switches `geronimo.view`, `geronimo.edit`, `ads.view`, added once even if the SQL already ran
- `js/geronimoCore.js`: the week's figures from the other reports (`gmComputeWeek`), used by the page and the bot. Check: `node automation/geronimo-core.check.mjs` (sales, rollovers, promotions, week ends).
- `automation/zenplanner-followup.mjs`: the nightly Geronimo step.
- `js/followUpCore.js`: loaded by the page for the Red / Orange tile.
- `supabase/geronimo_metrics_seed.sql`: 2026 history from the sheet, 42 weeks and 45 Scoreboard days (Jan–Mar). It never overwrites existing rows.
- Wiring:
  - `js/access.js`: permission group and page entry.
  - `js/siteMenu.js`: menu item.
  - `index.html`: Home page Reports list item (hidden by `access.js` without `geronimo.view`).
  - `js/settings.js`: Settings > Preferences "Start page" option.
  - `js/settings.js`: audit-log labels.
  - `.claude/preview-shots.mjs`: `geronimo` page.

**Set up (once):** in the Supabase SQL editor, run `supabase/geronimo_metrics.sql`, then `supabase/geronimo_metrics_seed.sql`.

**Check**
- Week ending 02/01/2026 shows cost per lead $95, conversion 0%, average visits 1.24, churn 1% and net +4.
- Scoreboard, January 2026 totals: rollovers 13, memberships 2, organic leads 16, cancels 3, kickstarts 29.
- Save a week, a wave person and a Scoreboard day, then reload: the values stay.
- A role without "Geronimo Metrics → View" gets the "No access" card, and the menu item is hidden.
- The current week shows a "to date" column with figures before anything is saved; the week of 16/10 shows "locked" after the next nightly run.
- Bot dry run lock-in on 2026-10-19 would save for 16/10: autopay 159, suspended 13, intro packs 8, sales value $3,100, Meta leads 16, spend $482.11.
- Edit week ending 16/10/2026: expect Intro + Pack sales 8, rollovers 0, Facebook spend $482.11 (the 16 Oct import). This week (ending 23/10) shows $466.60 from the 19 Oct import. Checked against live data on 2026-10-19.
- Trial waves > Update from member list: about 59 starters across Jul–Oct; September has about 30. Run on 2026-10-19: 146 added (202 starters Jan–Oct 2026), 49 rows filled in; open rollovers only for running packages (Sep 9, Oct 12). Emails: 0 matched (only 29 Ad Review leads).
- Bot dry run (`DRY_RUN=1 FORCE_RUN=true node --env-file=automation/.env automation/zenplanner-followup.mjs`) prints `Geronimo week ending …: not saved (DRY_RUN): {"attendance":…,"weekly_cancels":…,"cancels_mtd":…}`. On 2026-10-19: attendance 7, cancels 1 this week, 6 in October (12 drops minus 4 Administrative Drop and 2 beginner packages).

**Known limits**
- Rolling 30-day revenue needs the bank figure typed on the Scoreboard each day; the Monday Board estimate is a reference only.
- Member list history starts 2026-08-24, so sales and rollovers can't be worked out for earlier weeks (the imported sheet values stay).
- People are matched by name: two members with the same name would be treated as one.
- Facebook spend is Meta's rolling 7 days on the week's latest import, so it lines up with Saturday to Friday only when that import is dated Friday. It sums every ad on the import, including ads the Ad Review lists as inactive, so it can be higher than the Ad Review's "Spend · last 7 days" (16 Oct: $482.11 vs $436.32).
- Cancels are by drop reason: a drop logged with the wrong reason (e.g. a real cancel marked "Administrative Drop") is missed.
- Past due "owing" shows for the current week only; Zen Planner keeps no past balance in the app.

---

## Login intro animation (shipped 2026-10-19, b0b80e5)

After a successful sign-in, a full-screen intro plays once per browser session, then the page goes to the user's start page.

**Sequence (about 4.3 s; all motion anticlockwise)**
1. Wind arcs and 12 leaves spiral in.
2. The logo's centre swirl, cut into 4 rings, spins together and contracts into the icon. A faint trailing copy of each ring gives a motion-blur feel.
3. Merge: a soft flash and a short water ripple (SVG turbulence that calms to still).
4. A brush circle (ensō) draws around the icon, with its opening at the top-right, and rings spread outward.
5. "Welcome to Newcastle Aikido", a red line and "Studio Operations Portal" fade in.

**Rules**
- **Plays once per browser session:** tracked by the session cookie `na_intro=1`, which clears when the browser closes.
- **Skipped:** when the OS asks for reduced motion, or the user turned on Settings > Preferences "Reduce motion".
- **Preview:** add `?welcome=1` to any portal URL. It plays the intro every time, signed in or not, ignoring the cookie and reduced motion. After 4.3 s it reloads the login page without the parameter: signed-in users go to their start page, others see the sign-in form.

**Files**
- `js/login.js`: `playLoginIntro(user, force)`, called after `signInWithPassword` succeeds. It returns true when it played, and the redirect waits 4.3 s. `?welcome=1` calls it with `force`.
- `js/auth.js`: `?welcome=1` on any page redirects to `pages/login.html?welcome=1`, and a signed-in user isn't bounced off the login page while it plays.
- `css/styles.css`: the "Login intro" block (`.login-intro*`, `li-*` keyframes).
- Uses `imgs/aikido-logo-white.png`. The icon sits in the PNG's 300 px square at (91, 91.5), and masks hide the lettering ring and the seal.

**Check**
- In a fresh browser window, sign in: the intro plays.
- Sign out and back in: it's skipped.
- Close the browser, reopen it and sign in: it plays again.
- Open `<site>/?welcome=1`: the intro plays, then you land on your start page (or the sign-in form if signed out).
