# Graph Report - WrkPod-Projects  (2026-08-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 121 nodes · 182 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 6
- Community 7
- Community 8
- Community 9
- Community 11

## God Nodes (most connected - your core abstractions)
1. `renderMondayBoardCharts()` - 8 edges
2. `loadPage()` - 7 edges
3. `loadAttendanceReport()` - 7 edges
4. `loadMondayPage()` - 6 edges
5. `loadMondayTab()` - 6 edges
6. `loadHome()` - 6 edges
7. `dashboardCell()` - 5 edges
8. `loadSupabaseMemberList()` - 5 edges
9. `fetchSheetRaw()` - 5 edges
10. `normalizeRow()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (23): chartColors(), chartOptions(), dashboardCell(), dashboardDateLabels(), dashboardLabel(), escapeHtml(), fetchMondayBoardDashboard(), fetchMondaySheetRaw() (+15 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (19): classify(), escapeHtml(), fetchSheetRaw(), getHeaders(), HEADER_FALLBACKS, HOME_ADULTS_COLS, HOME_JUNIORS_COLS, initGradingPage() (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.27
Nodes (12): escapeHtml(), fetchSheetRaw(), getHeaders(), HEADER_FALLBACKS, initAttendanceReportPage(), loadAttendanceReport(), normalizeRow(), renderTable() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.36
Nodes (9): escapeSopHtml(), getCategoryNameByItemId(), getDrivePreviewUrl(), getSopById(), initSopReader(), renderSopAccordion(), renderSopDocument(), showMissingFileNotice() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.25
Nodes (8): btnText, errorContainer, errorText, form, showError(), spinner, submitBtn, waitForInviteSession()

### Community 6 - "Community 6"
Cohesion: 0.57
Nodes (6): buildMenu(), getMenuUrl(), groupHasActiveItem(), initSiteMenu(), initUnfinishedFeatureNotice(), renderMenuGroup()

### Community 7 - "Community 7"
Cohesion: 0.47
Nodes (3): initDropdownBehaviour(), initSiteHeader(), populateAvatarAsync()

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (5): dependencies, @supabase/ssr, @supabase/supabase-js, @supabase/ssr, @supabase/supabase-js

### Community 9 - "Community 9"
Cohesion: 0.83
Nodes (3): initAuth(), loadScript(), setupLogoutButton()

## Knowledge Gaps
- **21 isolated node(s):** `loadedTabs`, `MONDAY_PAGE_CONFIGS`, `mondaySheetCache`, `HEADER_FALLBACKS`, `HOME_ADULTS_COLS` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `loadedTabs`, `MONDAY_PAGE_CONFIGS`, `mondaySheetCache` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._