---
name: Newcastle Aikido Studio Operations
description: The dojo's internal operations portal, cut from its own cloth (Keikogi Indigo).
colors:
  ai-900: "#1f2124"
  ai-800: "#2f3237"
  ai-700: "#3d4146"
  ai-600: "#7c2d2e"
  ai-400: "#82a5e0"
  ai-200: "#c3d3f0"
  ai-100: "#dce5f7"
  ai-50: "#eaf0fb"
  cotton: "#f7f5f3"
  paper: "#ffffff"
  ink: "#2f3237"
  ink-2: "#4a4d52"
  ink-3: "#63666b"
  on-ai-2: "#c9cbcf"
  line: "#e4e0da"
  line-strong: "#cfcac2"
  beni: "#7c2d2e"
  beni-50: "#f6e9e8"
  moss: "#2f6b4a"
  moss-50: "#e7f1eb"
  kin: "#8a5d0c"
  kin-50: "#fbf2df"
typography:
  display:
    fontFamily: "Bebas Neue, Arial Narrow, Impact, sans-serif"
    fontSize: "clamp(2rem, 1.4rem + 1.6vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.1
    fontFeature: "tnum"
  headline:
    fontFamily: "Bebas Neue, Arial Narrow, Impact, sans-serif"
    fontSize: "clamp(1.65rem, 1.2rem + 1.5vw, 2.4rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Bebas Neue, Arial Narrow, Impact, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.1
    fontFeature: "tnum"
  title:
    fontFamily: "Bebas Neue, Arial Narrow, Impact, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "Arimo, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: "Merriweather, Georgia, Times New Roman, serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.6
  body-table:
    fontFamily: "Arimo, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Arimo, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.4
  column-head:
    fontFamily: "Arimo, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  shell-max: "1320px"
components:
  top-bar:
    backgroundColor: "{colors.ai-800}"
    textColor: "{colors.paper}"
    height: "64px"
  button-primary:
    backgroundColor: "{colors.ai-700}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.ai-800}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "38px"
  button-secondary-hover:
    backgroundColor: "{colors.ai-50}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.beni}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "38px"
  button-danger-hover:
    backgroundColor: "{colors.beni-50}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  key-plate:
    backgroundColor: "{colors.ai-800}"
    textColor: "{colors.paper}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  key-figure:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  tab:
    textColor: "{colors.on-ai-2}"
    padding: "14px 14px 16px"
  tab-active:
    textColor: "{colors.paper}"
  status-late:
    backgroundColor: "{colors.beni-50}"
    textColor: "{colors.beni}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  status-cleared:
    backgroundColor: "{colors.moss-50}"
    textColor: "{colors.moss}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  nav-item-active:
    backgroundColor: "{colors.ai-800}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

> **Brand kit override (binding).** Colours and type now follow the public site's brand kit (newcastleaikido.com): charcoal `#2F3237` replaces the indigo shell, dojo red `#7C2D2E` is the accent (links, focus, active tab, attention/overdue), soft blue `#82A5E0` carries progress meters and table washes, warm white `#F7F5F3` is the ground. Headings, figures and buttons use **Bebas Neue** (single weight, never bolded); sentences use **Merriweather**; UI, tables and fields use **Arimo**. Token names (`ai-*`, `cotton`, `beni`) are kept, so where the prose below says "indigo", read "charcoal". Layouts, stitch rules and components are unchanged.


# Design System: Newcastle Aikido Studio Operations

## Overview

**Creative North Star: "The Dojo's Own Cloth"**

The portal is cut from a keikogi: a deep kachi-indigo shell worn over bleached cotton, with a white sashiko running stitch as the only thread that divides or measures. Indigo owns whole regions (the top bar, the page-head, the tab strip, the home welcome band, the key-figure plate, the login field) rather than appearing as a lone accent on grey. Work happens on white paper panels resting on a cool cotton ground.

Density is calm, built for mid-task use: one number that matters reads first on a reversed indigo plate, then rows that scan quickly with right-aligned tabular figures and a short stitch run showing how far along or how overdue each person is. Colour carries meaning only at the edges: beni vermilion for overdue and error, moss for cleared and ok, kin amber for a pending notice. Everything else is indigo and its tints.

The system rejects the grey SaaS admin with one blue accent and a row of identical KPI cards. The figure strip is deliberately unequal (a wide indigo plate, then smaller white figures), and section dividers are stitched, not ruled.

**Key Characteristics:**
- Indigo owns regions; cotton and paper carry the work.
- The sashiko running stitch (9px stitch, 6px gap) is the divider and the measure.
- Rank by scale contrast: one display-size key figure, then smaller figures.
- Figures are tabular and right-aligned.
- On phones, one work area owns the viewport; table rows become stacked records.

## Colors

One indigo family from near-black to pale tint, two cotton/paper grounds, and three reserved signal colours.

### Primary
- **Kachi Indigo** (ai-800): the shell field. Top bar, page-head and tab strip, home welcome band, key-figure plate, login background, drawer header, active drawer/SOP/quick-switcher row, toast.
- **Deep Indigo** (ai-700): primary button fill and login button.
- **Hanada** (ai-600): links, focus outline, input focus border, the filled run of a stitch meter, chevrons and quiet interactive accents on paper.
- **Night Indigo** (ai-900): text on asagi avatars and selection; base of overlay scrims (rgba of this hue at 0.5 to 0.55).

### Secondary
- **Asagi** (ai-200): default stitch colour on paper, avatar fill, selection background, scrollbar thumb.
- **Indigo Mist** (ai-400): secondary-button hover border; the loading stitch.
- **Pale Asagi** (ai-100): table row rules, stitch-meter empty run, hem stitch inside the login card and lead tile.
- **Indigo Wash** (ai-50): table header band, hover fill for rows and menu items, disabled fill.

### Tertiary (signal, reserved)
- **Beni Vermilion** (beni) on **Beni Wash** (beni-50): overdue, error, logout, destructive outline. Its solid fill is reserved for overdue and the irreversible approve-cancellation action.
- **Moss** (moss) on **Moss Wash** (moss-50): cleared, eligible, week-over-week up, success.
- **Kin Amber** (kin) on **Kin Wash** (kin-50): an informational status notice in the SOP reader. Used only there.

### Neutral
- **Bleached Cotton** (cotton): page ground, child rows, form strips.
- **Paper** (paper): panels, cards, tables, dialogs; also all text on indigo.
- **Ink** (ink): primary text. **Ink 2** (ink-2): column heads, form labels. **Ink 3** (ink-3): secondary text, hints, metric labels.
- **Faded Indigo Text** (on-ai-2): secondary text on indigo (page meta, metric labels on the plate, tab labels at rest).
- **Line** (line) and **Line Strong** (line-strong): card borders, and input/secondary-button borders respectively.

### Named Rules
**The Indigo Owns Regions Rule.** Indigo is a field, not a highlight. It fills whole bands (shell, plate, welcome band, active row); it is never sprinkled as a thin accent stripe on a grey surface.

**The Signal Reserve Rule.** Beni means overdue or error, moss means cleared or ok. Neither is decoration, and beni appears as a solid fill only for overdue figures and an irreversible confirm. Ordinary delete is a beni outline on paper.

## Typography

**Display Font:** Zen Kaku Gothic New (with Segoe UI, system-ui), loaded at 500/700/900.
**Body Font:** the system UI stack, led by Segoe UI Variable Text.

**Character:** a squared, sturdy Japanese gothic for titles and figures over a plain native body face, so names and numbers carry the dojo's voice while running text stays invisible.

### Hierarchy
- **Display** (700, clamp 2rem to 2.75rem, 1.1, tabular): the one key figure on the indigo plate. One per view.
- **Headline** (700, clamp 1.65rem to 2.4rem, 1.1, -0.01em): page title in the indigo page-head.
- **Figure** (700, 1.75rem, 1.1, tabular): secondary key figures beside the plate; 1.4rem at 760px and below.
- **Title** (700, 1.1rem): card and dialog headings (dialogs 1.15rem, home sections 1.2rem, SOP reader title clamp 1.2rem to 1.55rem).
- **Body** (400, 1rem, 1.5): running text; ledes and descriptions cap at 70ch.
- **Body Table** (0.875rem, tabular numerals): every table cell.
- **Label** (600, 0.85rem, sentence case): form labels and metric labels.
- **Column Head** (700, 0.75rem, 0.05em, uppercase): table column heads and the phone record labels only.

### Named Rules
**The Tabular Figure Rule.** Every number that can be compared (money, counts, days, hours) is set in tabular numerals and right-aligned in its column.

**The Scale Ranks Rule.** Importance is shown by size contrast between one display figure and the rest, never by colouring a card or adding a label above it.

## Layout

The shell spans the viewport with a gutter of max(20px, (100vw - 1320px) / 2), so content holds a 1320px measure on wide screens. Each page stacks: a 64px indigo top bar (menu, logo and name left; "Find a page" trigger and avatar right) closed by a faint white stitch; the page-head row (title and one-line meta left, actions right, 30px top / 22px bottom); then the tab strip, which scrolls sideways without a scrollbar on narrow screens. Workspace padding is 28px top and 64px bottom.

Rhythm runs in 6 / 10 / 14 / 20 / 28px steps: 20px between cards and inside card edges, 14px between figure tiles, 10px between actions. The key strip is a grid of 1.5fr then equal columns (three on past-due, two on Monday, grading and attendance). Two-pane screens (SOP library, Monday member list) use a fixed left rail (300px / 280px) beside a fluid pane.

Breakpoints: at 1080px figure strips wrap to two columns with the plate spanning full width, and side rails stack (the open SOP reader moves above the category list). At 760px the quick-switcher trigger collapses to an icon, every grid goes single-column and workspace padding drops to 20px / 14px. At 640px tables marked as stackable become stacked records: headers hidden, each row a two-column grid with small uppercase labels drawn from the cell, the deciding figures (name, measure) ordered first.

## Elevation & Depth

Mostly flat. Depth comes from the indigo/cotton/paper contrast; shadows are faint on resting panels and appear clearly only on floating layers.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgba(15,24,48,0.06), 0 1px 1px rgba(15,24,48,0.04)`): cards, SOP rail and reader. Unchanged on hover.
- **Float** (`0 12px 32px rgba(15,24,48,0.16), 0 2px 6px rgba(15,24,48,0.08)`): dialogs, quick switcher, profile menu, toast.
- **Drawer** (`16px 0 40px rgba(15,24,48,0.22)`): the open side drawer.
- **Login card** (`0 24px 60px rgba(5,10,24,0.35)`): the paper card on the indigo field.

### Named Rules
**The Still Surface Rule.** Panels do not lift, scale or glow on hover; hover changes fill or border only.

## Shapes

Gentle, consistent corners: 8px on controls, inputs, menu rows and small panels; 12px on cards, figure tiles and the profile band; pill (999px) on status badges and category chips. Avatars and the logo are circles. The recurring geometry is the stitch: a 2px repeating dash used as a horizontal rule under card headings, dialog headers, home section titles, index rows and SOP categories, and as a 2px dashed hem inset 7 to 8px inside the login card and the lead home tile. The secondary home tiles use a 2px dashed white border as their edge.

## Components

### Buttons
Quiet, standard controls; the world lives in the shell, not in the buttons.
- **Shape:** gently rounded (8px), 38px tall, 16px side padding, 600 weight at 0.9rem.
- **Primary:** deep indigo fill with white text; hover darkens to kachi indigo. No lift, no shadow.
- **Secondary:** paper with a line-strong border and ink text; hover fills indigo wash and borders with indigo mist.
- **Danger:** paper with a beni border and beni text; hover fills beni wash.
- **On indigo:** transparent with a 30% white border; hover fills 12% white.
- **Disabled:** indigo wash fill, line border, ink-3 text.

### Chips
- **Status badge:** pill, 0.75rem bold with 0.04em tracking; beni on beni wash for past due, moss on moss wash for cleared, ink-2 on indigo wash for cancelled.
- **Trend badge:** pill with a small CSS triangle; moss up, beni down, ink-3 neutral.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** paper on cotton.
- **Shadow Strategy:** Rest (see Elevation).
- **Border:** 1px line.
- **Internal Padding:** 20px; the heading sits 16px / 20px with a stitch under it, inset 20px from each side.

### Inputs / Fields
- **Style:** paper, 1px line-strong border, 8px radius, 40px minimum height, 0.92rem text, label above in ink-2 at 0.85rem / 600.
- **Focus:** border turns hanada with a 3px hanada halo at 18% opacity.
- **On indigo:** the page filter is translucent white (8%) with a 28% white border, brightening to a solid white border on focus.
- **Login fields:** 52px tall with a floating label that shrinks to 0.75rem hanada on focus or fill.

### Navigation
- **Tabs:** a strip on indigo with a faint white top rule; labels on-ai-2 at 600 / 0.92rem, white on hover and active. The active tab is marked by a 3px white running stitch that draws in from the left.
- **Drawer:** paper panel up to 320px with a 64px indigo header; links ink on transparent, indigo wash on hover, kachi indigo fill with white text when active. Group toggles are 0.8rem uppercase ink-3.
- **Quick switcher (Ctrl+K):** a 560px paper dialog with a stitched search row; the selected result fills kachi indigo with white text.

### Key-Figure Strip (signature)
A grid led by a wide indigo plate carrying the page's one display figure with a small on-ai-2 label beneath, followed by smaller white figure tiles (figure size, ink-3 labels). Label sits under the figure, never above it.

### Stitch Meter (signature)
A 96px by 3px run of 6px stitches with 4px gaps: pale asagi for the empty run, hanada for progress, moss when complete, beni when late. The filled run draws in once from the left. Sits under the figure it measures, right-aligned in figure columns.

### Stacked Record (signature)
At 640px and below, stackable tables become one record per row: two-column grid, 14px / 16px padding, a pale asagi rule between records, small uppercase labels above values.

## Do's and Don'ts

### Do:
- **Do** fill whole regions with kachi indigo (top bar, page-head, tabs, key plate, welcome band) and keep work surfaces paper on cotton.
- **Do** draw every divider and measure as the running stitch (9px stitch, 6px gap; 6px / 4px inside the stitch meter).
- **Do** lead each report with one display figure on the indigo plate, then smaller figures beside it on white.
- **Do** set comparable numbers in tabular numerals and right-align them.
- **Do** keep beni for overdue and error and moss for cleared and ok.
- **Do** turn wide tables into stacked records at 640px, deciding figures first.
- **Do** honour reduced motion; the stitch draw-in, tab underline and toasts collapse to instant.

### Don't:
- **Don't** build a row of identical KPI cards; the strip is always one plate plus smaller figures.
- **Don't** use beni or moss as decoration, or give an ordinary delete a solid beni fill.
- **Don't** divide headed sections, index lists or menus with solid rules; the stitch does that. Table rows keep their 1px pale asagi rule and cards their 1px line border.
- **Don't** lift, scale or glow panels on hover.
- **Don't** put a small label, category or kicker line above a page title, card title or key figure; metadata sits beneath it.
