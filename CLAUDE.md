## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Update workflow (every change, in order)

Stack: static HTML/JS/CSS + Supabase (browser client), deployed by Netlify on push.
**Netlify build credits are limited: never push without the user's OK; batch changes into one push.**
Always on: ponytail `full` (minimal code), caveman (terse replies), security-guidance hook. Don't switch levels.

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
   | UI (`pages/`, `css/styles.css`, `index.html`) | `/impeccable shape` (plan) → build → `/impeccable polish` |
   | Slow page / query | agent-skills `performance-optimization` |
3. **Preview locally** — `npm start` (http://127.0.0.1:8000), then
   `node .claude/preview-shots.mjs .claude/shots 1440 900` and `... 390 844`: view the PNGs, fix any
   console errors or horizontal overflow it prints. Screenshots are layout only (no real login) —
   ask the user to check data-backed pages in their logged-in browser.
4. **Review the diff** — `/caveman-review` (bugs), `/ponytail-review` (bloat);
   + `/impeccable audit <page>` if UI changed; + `/security-review` if auth, RLS or input handling changed.
   Fix findings, repeat step 3 for anything visual.
5. **Hand over** — `graphify update .`; list what changed + what the user should click through. Wait for OK.
6. **Ship (only after OK)** — `/ship` checklist, `/caveman-commit` message, one commit, one push.

Skip other agent-skills (TDD, CI/CD, ADRs, specs, API design, observability, interview/idea) unless asked.
