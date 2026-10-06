# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Newcastle Aikido staff, signed in by invite only. Two groups, on mixed devices (desktop, tablet, phone):

- **Admin / front-desk staff** do the daily work: chasing overdue payments, importing CSVs, following SOPs mid-task.
- **Owners / management** read the reports to make decisions, especially at the weekly Monday board meeting.

## Product Purpose

The dojo's internal "Studio Operations" portal. It gathers the reports and procedures staff need to run the business side of the dojo in one signed-in place, replacing hunting through spreadsheets and Google Docs. Success: staff find the right number or procedure fast and act on it correctly.

## Operating Context

- **Monday board meeting (top priority):** a weekly membership snapshot with this week vs last week, trends by membership type, beginner progression, current member list, history log and pricing settings.
- **Past-due chasing (top priority):** an accounts-receivable dashboard built from CSV imports, with past-due, cleared, cancelled and exempted members, a member log, and import/export.
- **SOPs (top priority):** a library of procedures by category (billing, membership, CRM, invoicing, enquiries, email, grading, phones), read while doing the task, with add/edit/delete and links to the Google Drive source.
- **Grading and attendance reports:** eligibility to grade (attendance since last test vs hours needed) for adults and juniors, plus attendance records.
- **Account:** login, invite-based registration, password reset, profile.
- Data sources: Supabase (live production database, no staging) and published Google Sheets.
- Other top jobs: the user flagged one more but didn't name it (undecided).

## Capabilities and Constraints

- Static HTML/CSS/JS with no build step, one shared stylesheet (`css/styles.css`), deployed by Netlify on every push. Pushes cost build credits, so changes go out in batches.
- Shared page chrome is injected by JS: `js/siteHeader.js` (brand, profile menu), `js/siteMenu.js` (drawer and Ctrl+K quick switcher), `js/footer.js`.
- Chart.js renders the Monday board charts.
- Every existing page, tab, feature and data flow must keep working through any redesign.

## Brand Commitments

- The name **Newcastle Aikido** and the circular logo (`imgs/aikido-logo.png`; white version `imgs/aikido-logo-white.png` on dark) are binding.
- The public site's brand kit (newcastleaikido.com, Squarespace theme) is binding for colour and type, at the user's request:
  - Colours: charcoal `#2F3237`, dojo red accent `#7C2D2E`, soft blue `#82A5E0`, warm white `#F7F5F3`.
  - Type: Bebas Neue for headings and buttons, Merriweather for body sentences, Arimo for small/meta text (used here for UI, tables and fields).
  - Only the brand kit carries over; the portal keeps its own layouts and components.

## Evidence on Hand

- Real operational data is live in Supabase and Sheets. There are no public-facing claims, testimonials or marketing content, so none should be invented.

## Product Principles

1. The weekly numbers and the overdue money are the point. Surface them first, then the detail.
2. Staff use it mid-task, so an SOP or report should be one or two moves away from anywhere.
3. It has to work as well on a phone at the desk as on a laptop at the board meeting.
4. It's quiet internal tooling: clarity and speed over spectacle, with the dojo's identity in the details.
