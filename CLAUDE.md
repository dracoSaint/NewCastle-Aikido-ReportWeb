## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Update workflow (every change, in order)

Stack: static HTML/JS/CSS + Supabase (browser client). Deployed by Cloudflare Pages from the `production`
branch (`npm run build` → `dist/`) at https://dashboard.newcastleaikido.com. Netlify is retired; its last
deploy (`main`) only redirects the old URL to the dashboard via `_redirects`.
**Branches (since 2026-10-26): `production` = the live site and main branch. `testing` = test deployments
(Cloudflare preview) and the rollback branch. `main` is no longer used: never push or merge to it.
Never push without the user's OK; batch changes into one push. Ship = push `testing`, check its preview if
needed, then merge it into `production`.**
Always on: ponytail `full` (minimal code), caveman (terse replies), security-guidance hook. Don't switch levels.

0. **Catch up** — at session start, read the latest entry of `docs/WORKLOG.md` (instructions, decisions,
   open items) before anything else; `docs/CHANGES.md` explains each shipped/pending feature.
1. **Locate** — `graphify query "<question>"`; broad sweeps → caveman `cavecrew-investigator` agent.
2. **Build** — pick by change type:
   | Change | Use |
   |---|---|
   | Bug, cause known | caveman `surgical-patch` |
   | Bug, cause unclear | caveman `investigate-first`, then `surgical-patch` |
   | New feature | caveman `lean-build` |
   | Restructure, same behaviour | caveman `safe-refactor` |
   | DB table / RLS (`supabase/*.sql`) | caveman `migration` + supabase plugin |
   | Auth (`js/auth.js`, `js/login.js`), user input, RLS | agent-skills `security-and-hardening` |
   | UI (`pages/`, `css/styles.css`, `index.html`) | `/impeccable shape` (plan) → build (+ `ui-ux-pro-max` lookup, below) → `/impeccable polish` |
   | Slow page / query | agent-skills `performance-optimization` |
   **`ui-ux-pro-max`** (project skill, `.claude/skills/ui-ux-pro-max/`) = UX rule lookup while building UI.
   `DESIGN.md` (impeccable) stays the only source for colours, fonts, spacing.
   - Use it for one specific question at a time, e.g. a chip wraps, focus order, a form error, a chart choice.
     Run `"$PY" .claude/skills/ui-ux-pro-max/scripts/search.py "<2-5 words>" --domain ux -n 3`, with
     `PY="/c/Users/Drahcir Santos/AppData/Local/Programs/Python/Python312/python.exe"` (Python isn't on PATH).
     Domains: `ux`, `chart`, `icons`, `color`, `typography`.
   - Never use `--design-system`, `--persist` or `--stack`. The first two create a rival palette and fonts.
     No stack matches plain HTML/CSS (`html-tailwind` is Tailwind).
   - Don't read `references/quick-reference.md` whole (~6k tokens): Grep the rule name. Skip `pro-rules.md`
     (native mobile apps).
   - Results are advice, not orders: repo rules and `DESIGN.md` win.
3. **Preview locally** — `npm start` (http://127.0.0.1:8000), then
   `ONLY=<page> node .claude/preview-shots.mjs .claude/shots 1440 900`; fix any console errors or
   horizontal overflow it prints. Logs in for real (live data, view only) via `.claude/preview.env`. Save tokens: iterate on one page, one width, viewport shots (the default);
   run `... 390 844` and `FULL=1` only for the final check. UI change: also run
   `ONLY=<page> EVAL="$(cat .claude/ux-audit.js)" node .claude/preview-shots.mjs .claude/shots 390 844` (skip link,
   headings, names, labels, 24px targets, 16px fields, contrast, text under 12px); fix new findings. Ask the user to click through data pages too.
4. **Review the diff** — `/caveman-review` (bugs), `/ponytail-review` (bloat);
   + `/impeccable audit <page>` if UI changed; + `/security-review` if auth, RLS or input handling changed.
   Fix findings, repeat step 3 for anything visual.
5. **Hand over** — `graphify update .`; update the docs (below); list what changed + what the user should
   click through. Wait for OK.
6. **Ship (only after OK)** — `/ship` checklist, `/caveman-commit` message, one commit, one push; then mark
   the WORKLOG entry `shipped (<commit>)`. Push target: `testing` + `production` (never `main`).

**Docs (every time work finishes or anything changes, before hand-over):**
- `docs/WORKLOG.md` — add/extend today's entry (template at top): user's instructions, decisions, what was
  done, open items. Newest first. Absolute dates.
- `docs/CHANGES.md` — per feature: what it does, files, set-up steps, how to check, known limits.

**Token hygiene** (context size drives cost, not plugins):
- One feature per session; `/clear` after each push. Back after 1h+ idle on a long session? Start fresh, don't resume (cache rebuild costs 100k–450k).
- Files over ~400 lines (e.g. `js/pastDueMembers.js`, `css/styles.css`): Grep `-n` for the symbol, then Read only that line range.
- No subagents for reviews or small searches; run step 4 inline.

Skip other agent-skills (TDD, CI/CD, ADRs, specs, API design, observability, interview/idea) unless asked.
