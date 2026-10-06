---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["css/styles.css","pages/REPORTs/MondayBoardReport.html","pages/REPORTs/PastDueMembers.html","pages/SOPs/SOPDocuments.html","pages/REPORTs/GradingReport.html","pages/REPORTs/AttendanceReport.html","pages/profile.html","pages/login.html"]
---

## Scope

Whole Studio Operations portal: shared shell (header, drawer, quick switcher, footer), home, login/reset/register-error, Grading, Monday Board, Attendance, Past Due Members, SOP reader, Profile. Mode: Operate. Code-led build (no image generation).

## Audience and task

Admin staff (daily, mixed devices) and owners (Monday board meeting). Top jobs: Monday board numbers, past-due chasing, following SOPs. Must keep every feature and data flow. User dislikes: generic, old-fashioned/basic, hard to scan, clunky on phone, inconsistent. Avoid: flashy, dense.

## Direction contract

THESIS: The dojo's own cloth. An indigo shell over bleached cotton, with progress and debt drawn as a white sashiko running stitch. It refuses the grey SaaS admin with a single blue accent and a row of identical KPI cards.

OWN-WORLD:
- Colour: deep kachi indigo (#16223F) shell as a flat field, hanada (#2C4A7C) for interactive states, asagi tint (#8FA8C9) for rules, cool bleached-cotton ground (#F3F5F8) with white panels. Beni vermilion (#C2412D) only for overdue/error, moss (#3F7A57) only for cleared/ok.
- Type: Zen Kaku Gothic New for headings and figures (tabular), the system UI stack for body.
- Signature move: the sashiko stitch. Dashed white/indigo running-stitch rules are the only dividers, and every measure (days overdue, attendance toward grading, week-over-week) is drawn as a stitch run.

STORY: Staff open a page and the one number that matters reads first on an indigo plate. They scan the stitched rows to see who is furthest along or most overdue, then act with standard controls. It looks like their dojo, not a template.

FIRST VIEWPORT: A 64px indigo top bar: menu, logo and name on the left, "Find a page" and the avatar on the right. The page's tabs sit in a stitched strip directly under it (indigo, a white underline stitch on the active tab, scrolling sideways on phones). Below that are the page title and a one-line purpose, then a reversed indigo key-figure plate (display-size tabular figure, small label) with the secondary figures beside it on white, then the work table or charts. On home, an indigo welcome band with three "start here" jobs (Monday board, Past due, SOPs) as large stitched-edge tiles, then the full report and SOP index.

FORM: Keikogi Indigo, #4 on the ordered list; seed key 24384bdd. Raises: rank by scale contrast (type specimen); indigo owns whole regions (guide map); right-aligned tabular figures (j-card); on phones one work area owns the viewport (vertical feed).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- One more top job the user flagged but didn't name.
