# Changes

What each feature does, where it lives, and how to check it. Newest first. Session history and open
items are in `docs/WORKLOG.md`.

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
    - Monday Board weekly log: autopay members
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
  - **From the other reports** card for the chosen week (live, nothing stored): Red / Orange list (red · orange) and returns, new and cleared past due bills (import runs), past due owing (current week only), ads delivering and the ad with most leads. Each tile needs that report's view switch.
- **Trial waves:** people per month: induction date, inducted, name, email, phone, goal, why, notes and rolled over. Rollover % against the 80% target. Add, edit and remove are in a dialog; Rolled over can be changed in the table.
  - **Add starters from member list** (needs Monday Board view): adds every beginner-package holder to the wave of the month the package began (one row per membership, never duplicated), and fills blank Rolled over answers: Yes once they hold a full membership, No a week after the package ended without one. Answers staff gave are kept. A rollover always counts in the start month's wave.
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
- Trial waves > Add starters from member list: about 59 starters across Jul–Oct; September has about 30.
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
