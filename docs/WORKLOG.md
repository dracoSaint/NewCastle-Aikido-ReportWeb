# Work log

What was asked, what was decided, what was done and what is still open, newest session first.
**Every new session reads the "Open items" of the latest entry before starting work.**
**Every session adds an entry (or extends today's) when it finishes or changes anything.**

Entry template:

```
## YYYY-MM-DD — <short title>
Status: in progress | awaiting user OK | shipped (<commit>)
### Instructions from the user
### Decisions
### Done
### Open items
```

---

## 2026-10-19 — Monday Board: All Members tab

Status: **shipped (testing b0b80e5 / main fe17e96, 2026-10-19)**

### Instructions from the user
- Add an "ALL MEMBERS" tab to the Monday Board from the Zen Planner membership grid (all statuses), with the filters needed for 1,000+ rows.

### Decisions
- Data comes from the nightly Zen Planner job into a new table `membership_all` (Monday Board view/edit switches), not a live Zen Planner call.
- Server-side filtering and paging (50 per page) in a new `js/allMembers.js`. Only one line was touched in `js/mondayBoardScripts.js`.
- Safety: rows missing from the export are only removed when the export has at least 90% of the rows on file.
- Dark-glow design warning suppressed for `MondayBoardReport.html` (shared CSS, same false positive as other pages). A body-level clipped-overflow warning was left (pre-existing, unclear).

### Done
- See `docs/CHANGES.md` → "Monday Board: All Members tab".
- Export checked: 3,137 memberships, `number` unique. Bot dry run OK.
- The tab was previewed at 1440 and 390 px (shows the set-up notice until the SQL runs). No console errors after the `loadMondayTab` fix.

### Open items
1. Done: the user ran `supabase/membership_all.sql`. A one-off local run (All Members step only, bot login) filled 3,137 memberships. Checked in the tab: the counts, paging, and search "smith" + Cancelled = 10. The nightly job keeps it fresh from here.

## 2026-10-19 — Daily Ad Review: traffic campaigns

Status: **shipped (testing b0b80e5 / main fe17e96, 2026-10-19)**

### Instructions from the user
- Add traffic campaigns (not lead gen) to the Ad Review, in a tab-style split from the lead ads. The budget spent still includes the traffic campaign.

### Decisions
- New `ad_review_ads.campaign_type` (`leads` / `traffic`). It is set on import from Meta's result indicator (or "traffic" in the campaign name) and can be changed in the Hub.
- Lead ads / Traffic ads switch on the Daily Report reuses the Monday Board's `member-view-tile` buttons.
- Spend includes traffic everywhere; leads, CPL and verdicts use lead ads only.
- Traffic tab shows link clicks (impressions × CTR (LCT)) and cost per click: no new import columns.
- New ads are only sent `campaign_type` when they are traffic, so lead imports keep working before the SQL runs.

### Done
- See `docs/CHANGES.md` → "Daily Ad Review: traffic campaigns".
- Previewed at 1440 and 390 px with live data: 7 lead ads, 0 traffic, spend unchanged at $436.32. No console errors, no sideways scroll.

- Follow-up: Geronimo "Facebook budget spent" now uses the Ad Review's latest import dated in the week, instead of the import whose range starts nearest Saturday. The current week now has a figure ($466.60 from the 19 Oct import). A finished week with no import of its own stays blank.

- Follow-up: the user asked why intro pack and membership sales were 0 (the current week: nothing created 17–19 Oct; the member list refreshes Mondays).
  - The user confirmed: BECOME packages = trials; Beginner Adult follows BECOME Adult; Beginner Adult → Regular Adult is a promotion.
  - Change: a Beginner Adult with no package on file counts as a rollover, not a sale.
  - Direct membership sales since August: 4 (Regular Adult, Chiisai Kai, Combat Pilates, 8-14 Junior). The sheet's 5 for 16 Oct doesn't match. It may be template data, as noted on 2026-10-16.

### Open items
1. **User:** re-run `supabase/ad_review.sql`, then import a traffic campaign export (or mark an ad Traffic in the Hub) and check the Traffic tab.

## 2026-10-19 — Geronimo Metrics: end-of-week report from the other reports

Status: **shipped (testing b0b80e5 / main fe17e96, 2026-10-19)**

### Instructions from the user
- Connect the Geronimo Metrics Report to the other reports, so it works as an end-of-week report using all the week's data. Use the GRN_Metrics sheet as reference, and ask which report each figure comes from.
- Answers:
  - Revenue: A with B as reference. A = the bank's rolling 30-day figure typed on the Scoreboard daily, averaged over the week. B = the Monday Board estimate.
  - Sales value from Monday Board pricing; membership sales count one week's fee; rollovers not included.
  - Attendance: total only, from the Zen Planner attendance report the user linked, via the nightly bot.
  - Facebook spend: each Daily Ad Review import covers the 7 days before it.
  - Organic leads stay manual.
  - Cancels: status Cancelled only, via a new Zen Planner saved report exported by the bot.
  - Waves: auto-add BECOME / beginner starters; a rollover counts in the month the package started.
  - Rollover = same person, beginner package to full membership. Membership sales = all non-beginner except Gratis.
  - Add the "other reports" section (Past Due, Red/Orange, ads).

### Decisions
- `membership_data.number` is each membership's own id (a rollover gets a new number, with its begin date backdated to the package start). People are matched by name, as the Monday import does, and sales and rollovers are dated by `mbr_create_date`.
- Rollover % (weekly) waits a week after the packages end, for the next Monday list.
- Zen Planner's attendance totals view has no CSV link: the bot reads the Total row of `#idSearchResultsGrid`.
- The bot writes only `attendance` (and cancels later) to `geronimo_weekly`, and gets `geronimo.view/edit` on the SQL's first run.
- The waves sync is a button, not automatic on load, so nothing is written without a click.

### Done
- See `docs/CHANGES.md` → "Geronimo Metrics Report" (Fill from the app, the extras card, waves sync, the Scoreboard revenue column, the nightly bot).
- Checked:
  - The helpers, read-only against live data: rollovers found, e.g. September wave 30 starters with 8 rolled over.
  - Bot dry run: attendance 7 for the week ending 2026-10-23, nothing saved.
  - The page loads with no console errors (shows "No access" until the SQL runs).

- Cancels follow-up: the user gave the Zen Planner Members > Drops URL. Decided: count every drop except reason "Membership Upgrade" / "Administrative Drop", beginner packages and Gratis. The bot exports it nightly. Dry run: 1 this week, 6 in October.

- Follow-up: the user asked for an automatic week-to-date column, an automatic lock-in at the end of the week, and manual editing.
  - Decided: the calculations move to `js/geronimoCore.js`, shared by the page and the bot.
  - The page shows open weeks live; saved figures win.
  - The bot locks finished weeks nightly (fills blanks only, sets `locked_at`), checking the last two finished weeks.
  - "Fill from the app" button removed: Edit pre-fills blanks.
  - Bot gets `ads.view` too.
- Found: the user had already run an earlier `geronimo_metrics.sql` (tables, `member_number` and `revenue_30d` exist; `locked_at` does not). The preview login has no Geronimo switch, so the page couldn't be viewed with data.

### Open items
1. **User:** re-run `supabase/geronimo_metrics.sql` (adds `locked_at` and the Bot switches), then the seed. Then click through: Fill from the app on a recent week, Add starters from member list, a Scoreboard revenue entry, and the "From the other reports" card.
2. Answer from earlier, still open: which Monday snapshot a week uses (now the latest one taken that week).

## 2026-10-19 — Intro preview URL

Status: **shipped (testing b0b80e5 / main fe17e96, 2026-10-19)**

### Instructions from the user
- Make the intro animation testable with `<site>/?welcome=1`.
- Add the Geronimo Metrics Report to the Home page Reports list, like the others.

### Decisions
- The preview always plays: it ignores the session cookie and reduced motion, and doesn't set the cookie.
- It works signed in or out. After 4.3 s it reloads `login.html` without the parameter, so the normal redirects take over.

### Done
- `js/auth.js`, `js/login.js`: see `docs/CHANGES.md` → "Login intro animation" → Preview.
- `.claude/preview-shots.mjs`: added the `welcome` page (`index.html?welcome=1`).
- Geronimo Metrics Report added to the Home Reports list (`index.html`) and to the Settings start-page options (`js/settings.js`). It stays hidden until `supabase/geronimo_metrics.sql` runs and the role has `geronimo.view`. Suppressed the `dark-glow` false positive for `index.html` (shared CSS).
- Checked locally while signed in: the intro plays at `/?welcome=1`, then the page lands on `/index.html`. No console errors.

### Open items
- User tries `<site>/?welcome=1` on the live site after the push.

## 2026-10-16 — Login intro animation + Geronimo Metrics Report

Status: **shipped (testing b0b80e5 / main fe17e96, 2026-10-19)**

### Instructions from the user
- Add a login animation using our logo, inspired by https://www.newcastleaikido.com/. Show a preview before
  putting it on the site.
- Feedback rounds on the animation:
  - The first version looked wonky and the circle wasn't centred: make it more "wow" and more zen.
  - Animate the logo itself, warping in like wind or water.
  - Animate only the centre swirl: drop the lettering ring and the seal.
  - Pieces should merge "like leaves blown into each other".
  - Drop the shards: use wind / whirlwind, since the icon already looks like wind.
  - Reverse the spin, and make everything turn the same way.
- Approved. Play it on the **first login of each browser session**.
- Build the GRN_Metrics Google Sheet as a new report named **Geronimo Metrics Report**:
  https://docs.google.com/spreadsheets/d/18AiywesmcnxOyf70Ap3z3SWItLWrJ9QIwfOCninqKCs
  - Scope: Weekly Dashboard + Trial waves + Scoreboard.
  - Data entry: a manual form, auto-filled from data the app already holds.
  - Import the 2026 history of the Dashboard and the Scoreboard. Waves are not imported (personal data, not asked for).
  - Batch the login intro and this report into **one push**.
- Keep a documentation file and this log, and make reading/updating them part of the workflow (this file, `docs/CHANGES.md`, `CLAUDE.md`).

### Decisions
- **Intro timing:** the intro plays after a successful sign-in, then the page moves to the start page at 4.3 s.
- **"Once per session":** tracked by the session cookie `na_intro=1`.
- **Intro is skipped:** when the OS asks for reduced motion, or the user turned on Settings > Preferences "Reduce motion".
- **Weeks:** a week ends on Friday (Saturday to Friday), as in the sheet.
- **Worked out on the page, not stored:** average cost per lead, sales conversion, average visits, churn and net gain. They use the sheet's own formulas.
- **"Fill from the app" sources:**
  - Scoreboard: the week's sums, plus cancels this month
  - Monday Board: autopay = `membership_weekly_log.members_total`; suspended = HOLD count in `membership_data`, current week only
  - Daily Ad Review: Meta leads = `ad_review_leads` count

  It only uses sources the user's role can read.
- **Facebook spend is not prefilled:** the ad snapshots don't give a clean weekly spend.
- **New permission area `geronimo`:** View and Edit switches, given to Owner and Staff on first run.

### Done
- **Login intro:** see `docs/CHANGES.md` → "Login intro animation".
- **Geronimo Metrics Report:** see `docs/CHANGES.md` → "Geronimo Metrics Report".
- **Checks run:**
  - Previewed locally at 1440 and 390 px wide: no console errors, no sideways scroll.
  - Reviewed the changes inline. Fixed: a false-0 prefill for roles without access, lost focus on the Scoreboard, and a page-load race with `access.js`.
  - Ran `graphify update .`.
- **Design hook:** a `dark-glow` warning for `pages/REPORTs/GeronimoMetrics.html` is suppressed in `.impeccable/config.json`. It was a false positive from the shared CSS. A cramped-padding warning was fixed on the `.gm-filled` tag.

### Open items
1. **User runs the SQL** in the Supabase SQL editor, in this order: `supabase/geronimo_metrics.sql`, then `supabase/geronimo_metrics_seed.sql`. Until then the page says "No access".
2. **User clicks through:**
   - The login intro: a fresh browser plays it, signing out and in again skips it, closing the browser resets it.
   - The report checks listed in `docs/CHANGES.md`.
3. **User confirms the sheet's 2026 numbers are real.** The Dashboard figures are identical to the sheet's hidden 2024 "DO NOT EDIT" tab, so they may be template data.
4. **Ask the user** whether `js/mondayBoardScripts.js`, which had uncommitted changes from before this session, goes in the push.
5. **After the user's OK:** one commit (`/caveman-commit`), one push. Then mark this entry as shipped, with the commit hash.
6. **Optional follow-up:** `js/settings.js` (`initSettingsPage`) awaits `window.portalAccess` before `access.js` may have loaded, the same race fixed in `js/geronimoMetrics.js`. A clean fix is an "access ready" promise set up by `js/auth.js`.
