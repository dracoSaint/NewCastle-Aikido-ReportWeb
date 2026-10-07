// Daily Ad Review: the "DAILY AD REVIEW" Google Sheet as a portal report.
// Sheet tabs map to: AD REPORT -> Daily Report, AD LIST -> Ad Hub, <MONTH> REVIEW -> Monthly Review,
// IMPORT / LEADS / DATA LOG -> Import, SOP -> Playbook.

const AR_TABLES = { ads: 'ad_review_ads', snaps: 'ad_review_snapshots', actions: 'ad_review_actions', leads: 'ad_review_leads', playbook: 'ad_review_playbook' };
const AR_STAGES = ['Reported', 'Recommended', 'Approved', 'Acted'];

// The sheet's SOP tab. Staff can edit it on the Playbook tab; "rules" drives every diagnosis.
const AR_PLAYBOOK_DEFAULT = {
  rules: { impressions: 1000, ctrAll: 1.5, amberAll: 1.4, ctrLct: 1.0, amberLct: 0.9 },
  matrix: [
    ['Under threshold', '< 1,000 impr', 'Any', 'Any', 'Any', 'Gathering data', 'Wait for 1,000 impressions before acting; stops premature decisions.'],
    ['Low CTR (All)', '≥ 1,000 impr', '< 1.50%', 'Any', '0', 'Creative problem', 'Turn off ad. Swap in fresh image/video in proven style; keep message identical.'],
    ['Low CTR (LCT)', '≥ 1,000 impr', '≥ 1.50%', '< 1.00%', '0', 'Copy / offer problem', 'Turn off ad. Bulk-edit copy, tightening opening hook. Leave creative intact.'],
    ['Both low', '≥ 1,000 impr', '< 1.50%', '< 1.00%', '0', 'Creative first', 'Turn off ad. Fix creative first (swap visual); isolate variables sequentially.'],
    ['High CTRs, 0 leads', '≥ 1,000 impr', '≥ 1.50%', '≥ 1.00%', '0', 'Lead form problem', 'Ad is working; fix lead form & follow-up sequence. Do not rewrite ad.'],
    ['High CTRs + leads', '≥ 1,000 impr', '≥ 1.50%', '≥ 1.00%', '> 0', 'Winning / scalable', 'Keep the ad active and scale budget while CPL stays within target.']
  ],
  lights: { red: 'Not productive · close immediately', amber: 'Decent · 50/50, allowed', green: 'Great' },
  workflow: [
    ['Report', 'Super Sidekick', 'Surface the latest daily metrics and threshold status objectively. No intervention under 1k impressions.'],
    ['Recommend', 'Super Sidekick', 'Propose a specific action (turn off, swap creative, edit copy). Never kill an ad unilaterally.'],
    ['Approve', 'Owner / Coach', 'Review the findings and authorise the recommendation. Decision authority sits with the owner or coach.'],
    ['Act', 'Super Sidekick', 'Once approved, turn off, swap creative or edit copy in Meta Ads Manager immediately.']
  ],
  notes: [
    ['Golden rule', '1,000 impressions is the minimum. No result above 1k means turn the ad off. Zero exceptions.'],
    ['Order rule', 'If both CTRs are low, fix the creative first. Never fix both at once.']
  ]
};
const arClone = value => JSON.parse(JSON.stringify(value));
let arPlaybook = arClone(AR_PLAYBOOK_DEFAULT);
let arPlaybookMeta = null;     // { updated_at, updated_by } of the saved version
let arPlaybookEditing = false;

// Decision rules, read live from the playbook (percent values stored as 1.5 = 1.50%).
const arRule = () => arPlaybook.rules;
const arThreshold = () => Number(arRule().impressions) || 1000;
const arCtrAll = () => (Number(arRule().ctrAll) || 0) / 100;
const arCtrLct = () => (Number(arRule().ctrLct) || 0) / 100;
const arThresholdText = () => arThreshold().toLocaleString('en-AU');
const arThresholdShort = () => (arThreshold() % 1000 ? arThresholdText() : `${arThreshold() / 1000}k`);

let arAds = [];
let arSnaps = [];
let arActions = [];
let arLeads = [];
let arPendingImport = null;   // { kind: 'ads' | 'leads', rows, ... } waiting for confirmation
const arOpen = new Set();     // expanded Ad Hub rows (ad ids)

const arMoneyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

// ── Formatting ───────────────────────────────────────────────────────────────

function arEsc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
const arMoney = value => arMoneyFormat.format(Number(value) || 0);
const arPct = value => `${((Number(value) || 0) * 100).toFixed(2)}%`;
const arInt = value => Math.round(Number(value) || 0).toLocaleString('en-AU');
const arPlural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function arDate(iso, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-AU', options);
}

// 06/10/2026 and 29/09/26, as the sheet printed them (Australian order).
const arDmy = (iso, year = 'numeric') => arDate(iso, { day: '2-digit', month: '2-digit', year });

function arAddDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function arToast(message, isError = false) {
  const toast = document.getElementById('arToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(arToast.timer);
  arToast.timer = setTimeout(() => { toast.hidden = true; }, isError ? 6000 : 2500);
}

// ── Ad naming helpers (same rules as the sheet formulas) ─────────────────────

const arAdNo = name => (String(name || '').match(/^AD\s*\d+/i) || [''])[0].toUpperCase().replace(/\s+/, ' ');
const arShortName = name => arAdNo(name) || name;
const arCampaign = ad => ad?.campaign || ad?.ad_set || '';
const arStripMonth = text => String(text || '').replace(/ - [A-Za-z]{3} [0-9]{2}$/, '');
const arIsRetargeting = text => /retarget|warm/i.test(text || '');

function arAudience(text) {
  if (/retarget/i.test(text || '')) return 'Retargeting';
  if (/broad/i.test(text || '')) return 'Broad';
  return arStripMonth(text) || 'Unknown';
}

function arWeeksRunning(ad) {
  if (!ad.published_on) return null;
  const days = (Date.now() - new Date(`${ad.published_on}T00:00:00`)) / 86400000;
  return Math.round((days / 7) * 10) / 10;
}

// ── Diagnosis: the AD LIST formulas, word for word ───────────────────────────

function arEvaluate(m) {
  if (!m) return { met: false, diagnosis: 'No data on this report', action: 'Not in this report', tone: 'muted' };
  const lowAll = m.ctr_all < arCtrAll();
  const lowLct = m.ctr_lct < arCtrLct();
  if (m.impressions < arThreshold()) {
    return {
      met: false,
      diagnosis: `Gathering Data (< ${arThresholdText()} Impr)`,
      action: m.leads > 0
        ? `Wait for ${arThresholdText()} impressions before scaling (early traction: ${m.leads} leads)`
        : `Wait for ${arThresholdText()} impressions before acting (gathering data)`,
      tone: 'muted'
    };
  }
  const diagnosis = lowAll && lowLct ? 'Creative Problem (Both Low - Fix Creative First)'
    : lowAll ? 'Creative Problem (Low CTR All)'
      : lowLct ? 'Copy / Offer Problem (Low CTR LCT)'
        : m.leads === 0 ? 'Lead Form Bottleneck (High CTR, 0 Leads)'
          : 'Performing / Winning Ad';
  let action;
  if (m.leads === 0) {
    action = lowAll && lowLct ? 'Turn off ad (0 leads); Fix creative first (swap image/video)'
      : lowAll ? 'Turn off ad (0 leads); Swap creative with fresh image/video'
        : lowLct ? 'Turn off ad (0 leads); Rewrite copy & tighten opening line'
          : 'Turn off ad (0 leads); Audit & fix lead form / follow-up';
  } else {
    action = !lowAll && !lowLct ? 'Keep Active & Scale (Healthy CTRs + generating leads)'
      : lowLct ? 'Keep Active; Test tightened copy to lift CTR (LCT)'
        : 'Keep Active; Test fresh creative variant';
  }
  return { met: true, diagnosis, action, tone: action.startsWith('Turn off') ? 'bad' : 'good' };
}

// Traffic lights from the SOP tab: green / amber / red.
function arLight(value, kind) {
  const [green, amber] = kind === 'all' ? [arCtrAll(), arRule().amberAll / 100] : [arCtrLct(), arRule().amberLct / 100];
  return value >= green ? 'is-green' : value >= amber ? 'is-amber' : 'is-red';
}

function arCtr(value, kind) {
  return `<span class="ar-light ${arLight(value, kind)}">${arPct(value)}</span>`;
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function arClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your session has ended. Please sign in again.');
  return window.supabaseClient;
}

async function arLoad() {
  const client = await arClient();
  const [ads, snaps, actions, leads, playbook] = await Promise.all([
    client.from(AR_TABLES.ads).select('*').order('ad_name'),
    client.from(AR_TABLES.snaps).select('*').order('report_date', { ascending: false }),
    client.from(AR_TABLES.actions).select('*'),
    client.from(AR_TABLES.leads).select('*').order('created_time', { ascending: true }),
    client.from(AR_TABLES.playbook).select('*').eq('id', 1).maybeSingle()
  ]);
  // A missing playbook table only means the original playbook is shown.
  if (playbook.error) console.warn('Playbook not saved yet:', playbook.error.message);
  arPlaybook = arMergePlaybook(playbook.data?.content);
  arPlaybookMeta = playbook.data || null;
  const failed = [ads, snaps, actions, leads].find(result => result.error);
  if (failed) {
    const missing = /does not exist|schema cache/i.test(failed.error.message);
    throw new Error(missing ? 'The ad review tables are not set up yet. Run supabase/ad_review.sql in Supabase.' : failed.error.message);
  }
  arAds = ads.data || [];
  arSnaps = snaps.data || [];
  arActions = actions.data || [];
  arLeads = leads.data || [];
  arRender();
}

const arReportDates = () => [...new Set(arSnaps.map(snap => snap.report_date))].sort().reverse();
const arSelectedDate = () => document.getElementById('arReportDate')?.value || arReportDates()[0] || '';
const arSnapFor = (adId, date) => arSnaps.find(snap => snap.ad_id === adId && snap.report_date === date);
const arActionFor = (adId, date) => arActions.find(item => item.ad_id === adId && item.report_date === date);

function arMetrics(snap) {
  if (!snap) return null;
  const spent = Number(snap.amount_spent) || 0;
  const leads = Number(snap.leads) || 0;
  return {
    impressions: Number(snap.impressions) || 0,
    ctr_all: Number(snap.ctr_all) || 0,
    ctr_lct: Number(snap.ctr_lct) || 0,
    spent,
    leads,
    cpl: leads > 0 ? spent / leads : 0
  };
}

function arRange(date) {
  const snap = arSnaps.find(item => item.report_date === date && item.range_start);
  return { start: snap?.range_start || arAddDays(date, -7), end: date };
}

// Ads that were live on a report: Meta delivery that day, or the Hub status for older data.
function arReportAds(date) {
  return arAds
    .map(ad => ({ ad, snap: arSnapFor(ad.id, date) }))
    .filter(({ ad, snap }) => snap && (snap.delivery ? snap.delivery.toLowerCase() === 'active' : ad.status === 'ACTIVE'))
    .map(({ ad, snap }) => ({ ad, m: arMetrics(snap), action: arActionFor(ad.id, date)?.action || '' }));
}

function arLeadsFor(date) {
  const { start, end } = arRange(date);
  return arLeads.filter(lead => {
    const day = lead.created_time ? new Date(lead.created_time).toLocaleDateString('en-CA') : '';
    return day >= start && day <= end;
  });
}

// ── Daily Report (AD REPORT tab) ─────────────────────────────────────────────

function arSummaryFor(rows) {
  const byLeads = [...rows].sort((a, b) => b.m.leads - a.m.leads || b.m.impressions - a.m.impressions);
  const top = byLeads[0];
  const topText = top
    ? `${top.ad.ad_name} (${arStripMonth(arCampaign(top.ad))}) is our main lead source with ${arPct(top.m.ctr_all)} CTR (All), ${arPct(top.m.ctr_lct)} CTR (LCT), and ${arPlural(top.m.leads, 'lead')} at ${arMoney(top.m.cpl)} CPL.`
    : 'No active ads';

  const totalLeads = rows.reduce((sum, row) => sum + row.m.leads, 0);
  const retargetLeads = rows.filter(row => /retarget/i.test(arCampaign(row.ad))).reduce((sum, row) => sum + row.m.leads, 0);
  const leadsText = `${arPlural(totalLeads, 'Lead')} (${retargetLeads} Retargeting / ${totalLeads - retargetLeads} Broad)`;

  const met = rows.filter(row => row.m.impressions >= arThreshold());
  const healthy = met.filter(row => row.m.ctr_all >= arCtrAll()).length;
  const zero = met.filter(row => row.m.leads === 0).map(row => arAdNo(row.ad.ad_name) || row.ad.ad_name);
  const cheapest = rows.filter(row => row.m.leads > 0).sort((a, b) => a.m.cpl - b.m.cpl)[0];
  const spend = rows.reduce((sum, row) => sum + row.m.spent, 0);
  let takeaway = `${healthy} of ${met.length} threshold ads are above ${(arCtrAll() * 100).toFixed(1)}% CTR (All). `;
  if (zero.length) takeaway += `${zero.join(', ')} ${zero.length > 1 ? "aren't" : "isn't"} converting yet (0 leads). `;
  else if (met.length) takeaway += 'All threshold ads are generating leads. ';
  if (cheapest) takeaway += `${arShortName(cheapest.ad.ad_name)} brought in the cheapest lead at ${arMoney(cheapest.m.cpl)} CPL. `;
  takeaway += `Total spend was ${arMoney(spend)} at a ${totalLeads ? `${arMoney(spend / totalLeads)} blended CPL.` : '$0 blended CPL (no leads yet).'}`;

  return { topText, leadsText, takeaway, spend, totalLeads };
}

const arThresholdLabel = row => `${row.ad.ad_name} | ${arCampaign(row.ad)}`;
const arUnderLabel = row => `${row.ad.ad_name} (${arAudience(arCampaign(row.ad))})${(arWeeksRunning(row.ad) ?? 9) < 1 ? ' – NEW' : ''}`;

function arMetricLine(row, met) {
  const base = `\`Impressions:\` ${arInt(row.m.impressions)} | \`CTR (All):\` ${arPct(row.m.ctr_all)} | \`CTR (LCT):\` ${arPct(row.m.ctr_lct)}`;
  if (met) return `${base} | \`CPL:\` ${arMoney(row.m.cpl)} | \`Leads:\` ${row.m.leads}`;
  return row.m.leads > 0 ? `${base} | Generated ${arPlural(row.m.leads, 'Lead')} at ${arMoney(row.m.cpl)} CPL!` : base;
}

function arLeadLines(leads) {
  return leads.map((lead, index) => {
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead';
    const source = /retarget/i.test(lead.campaign_name || '') ? 'Retargeting' : arStripMonth(lead.campaign_name || lead.adset_name);
    const platform = { ig: 'Instagram', fb: 'Facebook' }[lead.platform] || lead.platform || 'Meta';
    return {
      title: `${index + 1}. ${name} | ${source} (${arShortName(lead.ad_name)} – ${platform})`,
      email: lead.email || '',
      phone: String(lead.phone || '').replace(/^p:/, '')
    };
  });
}

function arReportRowsHtml(rows, met, date) {
  if (!rows.length) {
    return `<div class="empty">${met ? `No ads past ${arThresholdText()} impressions yet.` : 'No ads in the testing phase.'}</div>`;
  }
  return `
    <table class="stack ar-table">
      <thead><tr><th>Ad</th><th class="num">Impressions</th><th class="num">CTR (All)</th><th class="num">CTR (LCT)</th><th class="num">Leads</th><th class="num">CPL</th><th>Hub recommendation</th><th>Action</th></tr></thead>
      <tbody>${rows.map(row => {
        const verdict = arEvaluate(row.m);
        const isNew = (arWeeksRunning(row.ad) ?? 9) < 1;
        return `
          <tr>
            <td data-label="Ad"><strong>${arEsc(row.ad.ad_name)}</strong>${isNew ? ' <span class="ar-tag">New</span>' : ''}<small class="pd-sub">${arEsc(arCampaign(row.ad))}</small></td>
            <td class="num" data-label="Impressions">${arInt(row.m.impressions)}<span class="stitch-meter${row.m.impressions >= arThreshold() ? ' done' : ''}" style="--p:${Math.min(row.m.impressions / arThreshold(), 1).toFixed(2)}" aria-hidden="true"></span></td>
            <td class="num" data-label="CTR (All)">${arCtr(row.m.ctr_all, 'all')}</td>
            <td class="num" data-label="CTR (LCT)">${arCtr(row.m.ctr_lct, 'lct')}</td>
            <td class="num" data-label="Leads">${row.m.leads}</td>
            <td class="num" data-label="CPL">${row.m.leads ? arMoney(row.m.cpl) : '—'}</td>
            <td data-label="Hub recommendation"><span class="ar-verdict is-${verdict.tone}">${arEsc(verdict.action)}</span></td>
            <td data-label="Action" class="ar-action-cell">
              <textarea rows="3" maxlength="1000" data-action-ad="${row.ad.id}" data-action-date="${arEsc(date)}" aria-label="Action for ${arEsc(row.ad.ad_name)}" placeholder="What was decided?">${arEsc(row.action)}</textarea>
            </td>
          </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function arRenderReport(date) {
  const rows = arReportAds(date).sort((a, b) => b.m.impressions - a.m.impressions);
  const met = rows.filter(row => row.m.impressions >= arThreshold());
  const under = rows.filter(row => row.m.impressions < arThreshold());
  const summary = arSummaryFor(rows);
  const avgCtr = rows.length ? rows.reduce((sum, row) => sum + row.m.ctr_all, 0) / rows.length : 0;

  document.getElementById('arReportMetrics').innerHTML = `
    <div class="past-due-metric key"><span>Spend · last 7 days</span><strong>${arMoney(summary.spend)}</strong></div>
    <div class="past-due-metric"><span>Leads</span><strong>${summary.totalLeads}</strong></div>
    <div class="past-due-metric"><span>Blended CPL</span><strong>${summary.totalLeads ? arMoney(summary.spend / summary.totalLeads) : '—'}</strong></div>
    <div class="past-due-metric"><span>Average CTR (All)</span><strong>${arPct(avgCtr)}</strong></div>`;

  document.getElementById('arSummary').innerHTML = `
    <div><dt>Top performer</dt><dd>${arEsc(summary.topText)}</dd></div>
    <div><dt>Total leads generated</dt><dd>${arEsc(summary.leadsText)}</dd></div>
    <div><dt>Key takeaway</dt><dd>${arEsc(summary.takeaway)}</dd></div>`;

  document.getElementById('arThresholdTable').innerHTML = arReportRowsHtml(met, true, date);
  document.getElementById('arUnderTable').innerHTML = arReportRowsHtml(under, false, date);

  const leads = arLeadLines(arLeadsFor(date));
  document.getElementById('arLeadTitle').textContent = `Lead log (${leads.length})`;
  document.getElementById('arLeadTable').innerHTML = leads.length
    ? `<table class="stack ar-table"><thead><tr><th>Lead</th><th>Email</th><th>Phone</th></tr></thead><tbody>${leads.map(lead => `
        <tr>
          <td data-label="Lead"><strong>${arEsc(lead.title)}</strong></td>
          <td data-label="Email">${lead.email ? `<a href="mailto:${arEsc(lead.email)}">${arEsc(lead.email)}</a>` : '—'}</td>
          <td data-label="Phone">${lead.phone ? `<a href="tel:${arEsc(lead.phone)}">${arEsc(lead.phone)}</a>` : '—'}</td>
        </tr>`).join('')}</tbody></table>`
    : '<div class="empty">No leads in this date range. Import the Meta leads export to fill this in.</div>';

  const steps = [...met, ...under].filter(row => row.action.trim());
  document.getElementById('arSteps').innerHTML = steps.length
    ? steps.map(row => `<li><strong>${arEsc(arShortName(row.ad.ad_name))}</strong> – ${arEsc(row.action)}</li>`).join('')
    : '<li class="pd-muted">Fill in the Action column above and the steps compile here.</li>';
}

function arSlackText(date) {
  const rows = arReportAds(date).sort((a, b) => b.m.impressions - a.m.impressions);
  const met = rows.filter(row => row.m.impressions >= arThreshold());
  const under = rows.filter(row => row.m.impressions < arThreshold());
  const summary = arSummaryFor(rows);
  const { start } = arRange(date);
  const block = (list, label, empty) => list.length
    ? list.map(row => `• ${label(row)}\n   ${arMetricLine(row, label === arThresholdLabel)}\n   Action: ${row.action}`).join('\n')
    : empty;
  const leads = arLeadLines(arLeadsFor(date));
  const steps = [...met, ...under].filter(row => row.action.trim()).map((row, index) => `${index + 1}. ${arShortName(row.ad.ad_name)} – ${row.action}`);

  return [
    `AD REPORT: ${arDmy(date)}`,
    '',
    `DATA Date Range: ${arDmy(start, '2-digit')} – ${arDmy(date, '2-digit')}`,
    '',
    'EXECUTIVE SUMMARY',
    `• Top Performer: ${summary.topText}`,
    `• Total Leads Generated: ${summary.leadsText}`,
    `• Key Takeaway: ${summary.takeaway}`,
    '',
    `THRESHOLD MET ADS (${arThresholdShort()}+ Impressions)`,
    block(met, arThresholdLabel, `No ads past ${arThresholdText()} impressions yet`),
    '',
    `UNDER THRESHOLD ADS (Testing Phase - <${arThresholdShort()} Impressions)`,
    block(under, arUnderLabel, 'No ads in testing phase'),
    '',
    `LEAD LOG (${leads.length} TOTAL)`,
    leads.length
      ? leads.map(lead => `${lead.title}\n   • \`Email:\` ${lead.email}\n   • \`Phone:\` ${lead.phone}`).join('\n\n')
      : 'No leads in this date range',
    '',
    'STEPS TAKEN:',
    steps.join('\n')
  ].join('\n');
}

async function arSaveAction(textarea) {
  const adId = Number(textarea.dataset.actionAd);
  const date = textarea.dataset.actionDate;
  const text = textarea.value.trim();
  const existing = arActionFor(adId, date);
  if ((existing?.action || '') === text) return;
  try {
    const client = await arClient();
    if (!text) {
      const { error } = await client.from(AR_TABLES.actions).delete().eq('ad_id', adId).eq('report_date', date);
      if (error) throw error;
      arActions = arActions.filter(item => item !== existing);
    } else {
      const { data, error } = await client.from(AR_TABLES.actions)
        .upsert({ ad_id: adId, report_date: date, action: text, updated_at: new Date().toISOString() }, { onConflict: 'ad_id,report_date' })
        .select().single();
      if (error) throw error;
      arActions = arActions.filter(item => item !== existing).concat(data);
    }
    arRenderReportSteps(date);
    arToast('Action saved.');
  } catch (error) {
    arToast(error.message || 'Could not save the action.', true);
  }
}

// Only the steps list depends on actions; avoid re-rendering the tables mid-typing.
function arRenderReportSteps(date) {
  const rows = arReportAds(date).sort((a, b) => b.m.impressions - a.m.impressions);
  const ordered = [...rows.filter(row => row.m.impressions >= arThreshold()), ...rows.filter(row => row.m.impressions < arThreshold())];
  const steps = ordered.filter(row => row.action.trim());
  document.getElementById('arSteps').innerHTML = steps.length
    ? steps.map(row => `<li><strong>${arEsc(arShortName(row.ad.ad_name))}</strong> – ${arEsc(row.action)}</li>`).join('')
    : '<li class="pd-muted">Fill in the Action column above and the steps compile here.</li>';
}

// ── Ad Hub (AD LIST tab) ─────────────────────────────────────────────────────

function arHubRowsHtml(ads, date) {
  if (!ads.length) return '<div class="empty">No ads here.</div>';
  return `
    <table class="stack ar-table ar-hub-table">
      <thead><tr><th><span class="sr-only">Details</span></th><th>Ad</th><th class="num">Impressions</th><th class="num">CTR (All)</th><th class="num">CTR (LCT)</th><th class="num">Leads</th><th class="num">CPL</th><th class="num">Spent</th><th>Diagnosis</th><th>Stage</th></tr></thead>
      <tbody>${ads.map(ad => {
        const m = arMetrics(arSnapFor(ad.id, date));
        const verdict = arEvaluate(m);
        const weeks = arWeeksRunning(ad);
        const open = arOpen.has(ad.id);
        return `
          <tr class="parent-row${open ? ' is-open' : ''}" data-ad="${ad.id}">
            <td class="pd-toggle-cell"><button type="button" class="toggle-btn" aria-expanded="${open}" aria-controls="arAd-${ad.id}" aria-label="Edit ${arEsc(ad.ad_name)}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></td>
            <td data-label="Ad"><strong>${arEsc(ad.ad_name)}</strong><small class="pd-sub">${arEsc(arCampaign(ad) || 'No campaign set')}${weeks !== null ? ` · ${weeks} wk${weeks === 1 ? '' : 's'}` : ''}</small></td>
            <td class="num" data-label="Impressions">${m ? arInt(m.impressions) : '—'}</td>
            <td class="num" data-label="CTR (All)">${m ? arCtr(m.ctr_all, 'all') : '—'}</td>
            <td class="num" data-label="CTR (LCT)">${m ? arCtr(m.ctr_lct, 'lct') : '—'}</td>
            <td class="num" data-label="Leads">${m ? m.leads : '—'}</td>
            <td class="num" data-label="CPL">${m?.leads ? arMoney(m.cpl) : '—'}</td>
            <td class="num" data-label="Spent">${m ? arMoney(m.spent) : '—'}</td>
            <td data-label="Diagnosis"><span class="ar-verdict is-${!verdict.met ? 'muted' : verdict.diagnosis.startsWith('Performing') ? 'good' : 'bad'}">${arEsc(verdict.diagnosis)}</span><small class="pd-sub">${arEsc(verdict.action)}</small></td>
            <td data-label="Stage">
              <select data-ad-field="workflow_stage" aria-label="Workflow stage for ${arEsc(ad.ad_name)}">
                <option value="">Not started</option>
                ${AR_STAGES.map(stage => `<option${stage === ad.workflow_stage ? ' selected' : ''}>${stage}</option>`).join('')}
              </select>
            </td>
          </tr>
          <tr class="child-row" id="arAd-${ad.id}" data-ad="${ad.id}"${open ? '' : ' hidden'}>
            <td colspan="10">
              <div class="ar-edit">
                <label><span>Ad name</span><input type="text" data-ad-field="ad_name" value="${arEsc(ad.ad_name)}" maxlength="200"></label>
                <label><span>Campaign</span><input type="text" data-ad-field="campaign" value="${arEsc(ad.campaign || '')}" maxlength="200"></label>
                <label><span>Ad set</span><input type="text" data-ad-field="ad_set" value="${arEsc(ad.ad_set || '')}" maxlength="200"></label>
                <label><span>Published</span><input type="date" data-ad-field="published_on" value="${arEsc(ad.published_on || '')}"></label>
                <label><span>Status</span><select data-ad-field="status">${['ACTIVE', 'INACTIVE'].map(status => `<option${status === ad.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
                <label class="ar-edit-wide"><span>Action owner / notes</span><textarea rows="2" data-ad-field="owner_notes" maxlength="2000">${arEsc(ad.owner_notes || '')}</textarea></label>
                <div class="ar-edit-foot">
                  <small>Changes save as you go.</small>
                  <button type="button" class="pd-link" data-delete-ad="${ad.id}">Delete ad and its history</button>
                </div>
              </div>
            </td>
          </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function arRenderHub(date) {
  const active = arAds.filter(ad => ad.status === 'ACTIVE');
  const inactive = arAds.filter(ad => ad.status !== 'ACTIVE');
  const activeMetrics = active.map(ad => arMetrics(arSnapFor(ad.id, date))).filter(Boolean);
  const spend = activeMetrics.reduce((sum, m) => sum + m.spent, 0);
  const leads = activeMetrics.reduce((sum, m) => sum + m.leads, 0);
  const verdicts = activeMetrics.map(arEvaluate);
  const ready = verdicts.filter(verdict => verdict.met).length;
  const needAction = verdicts.filter(verdict => verdict.action.startsWith('Turn off')).length;
  const keep = verdicts.filter(verdict => verdict.action.startsWith('Keep Active')).length;

  document.getElementById('arHubMetrics').innerHTML = `
    <div class="past-due-metric key"><span>Total spend · ${arPlural(active.length, 'active ad')}</span><strong>${arMoney(spend)}</strong></div>
    <div class="past-due-metric"><span>Leads · blended CPL</span><strong>${leads}<small>${leads ? arMoney(spend / leads) : '—'}</small></strong></div>
    <div class="past-due-metric"><span>Ready for decision</span><strong>${ready}<small>${activeMetrics.length - ready} gathering</small></strong></div>
    <div class="past-due-metric"><span>Need action</span><strong>${needAction}<small>${keep} keep / scale</small></strong></div>`;

  const byImpressions = (a, b) => (Number(arSnapFor(b.id, date)?.impressions) || 0) - (Number(arSnapFor(a.id, date)?.impressions) || 0);
  document.getElementById('arActiveCount').textContent = arPlural(active.length, 'ad');
  document.getElementById('arInactiveCount').textContent = arPlural(inactive.length, 'ad');
  document.getElementById('arActiveTable').innerHTML = arHubRowsHtml(active.sort(byImpressions), date);
  document.getElementById('arInactiveTable').innerHTML = arHubRowsHtml(inactive.sort(byImpressions), date);
}

async function arSaveAdField(input) {
  const adId = Number(input.closest('[data-ad]').dataset.ad);
  const ad = arAds.find(item => item.id === adId);
  const field = input.dataset.adField;
  const value = input.value.trim() || null;
  if (!ad || (ad[field] ?? null) === value) return;
  if (field === 'ad_name' && !value) {
    input.value = ad.ad_name;
    arToast('An ad needs a name.', true);
    return;
  }
  try {
    const client = await arClient();
    const { error } = await client.from(AR_TABLES.ads).update({ [field]: value }).eq('id', adId);
    if (error) throw error;
    ad[field] = value;
    // Re-render, then put focus back where the user had tabbed to.
    const active = document.activeElement;
    const row = active?.dataset?.adField ? active.closest('tr[data-ad]') : null;
    const target = row ? `tr.${row.classList.contains('child-row') ? 'child-row' : 'parent-row'}[data-ad="${row.dataset.ad}"] [data-ad-field="${active.dataset.adField}"]` : '';
    arRender();
    if (target) document.querySelector(target)?.focus();
    arToast('Saved.');
  } catch (error) {
    input.value = ad[field] ?? '';
    arToast(/duplicate key/i.test(error.message) ? 'Another ad already has that name.' : (error.message || 'Could not save.'), true);
  }
}

async function arDeleteAd(adId) {
  const ad = arAds.find(item => item.id === adId);
  if (!ad || !window.confirm(`Delete "${ad.ad_name}" and all of its report history? This cannot be undone.`)) return;
  try {
    const client = await arClient();
    const { error } = await client.from(AR_TABLES.ads).delete().eq('id', adId);
    if (error) throw error;
    arAds = arAds.filter(item => item.id !== adId);
    arSnaps = arSnaps.filter(snap => snap.ad_id !== adId);
    arActions = arActions.filter(item => item.ad_id !== adId);
    arRender();
    arToast(`${ad.ad_name} deleted.`);
  } catch (error) {
    arToast(error.message || 'Could not delete the ad.', true);
  }
}

// ── Monthly Review (<MONTH> REVIEW tabs) ─────────────────────────────────────

function arRenderMonth() {
  const select = document.getElementById('arMonth');
  const months = [...new Set(arReportDates().map(date => date.slice(0, 7)))];
  const current = select.value && months.includes(select.value) ? select.value : (arSelectedDate().slice(0, 7) || months[0] || '');
  select.innerHTML = months.map(month => `<option value="${month}"${month === current ? ' selected' : ''}>${arDate(`${month}-01`, { month: 'long', year: 'numeric' })}</option>`).join('');
  const grid = document.getElementById('arMonthGrid');
  if (!current) {
    grid.innerHTML = '<div class="empty">No reports yet. Import a Meta ads report to begin.</div>';
    document.getElementById('arMonthMetrics').innerHTML = '';
    return;
  }
  document.getElementById('arMonthTitle').textContent = `${arDate(`${current}-01`, { month: 'long', year: 'numeric' })} review`;

  const dates = arReportDates().filter(date => date.startsWith(current)).sort();
  const latest = dates[dates.length - 1];
  const latestSnaps = arSnaps.filter(snap => snap.report_date === latest).map(arMetrics);
  const spend = latestSnaps.reduce((sum, m) => sum + m.spent, 0);
  const leads = latestSnaps.reduce((sum, m) => sum + m.leads, 0);
  const avg = latestSnaps.length ? latestSnaps.reduce((sum, m) => sum + m.ctr_all, 0) / latestSnaps.length : 0;
  document.getElementById('arMonthMetrics').innerHTML = `
    <div class="past-due-metric key"><span>Total spend · report ${arDate(latest, { day: 'numeric', month: 'short' })}</span><strong>${arMoney(spend)}</strong></div>
    <div class="past-due-metric"><span>Total leads</span><strong>${leads}</strong></div>
    <div class="past-due-metric"><span>Blended CPL</span><strong>${leads ? arMoney(spend / leads) : '—'}</strong></div>
    <div class="past-due-metric"><span>Average CTR (All)</span><strong>${arPct(avg)}</strong></div>`;

  const ads = arAds.filter(ad => dates.some(date => arSnapFor(ad.id, date)))
    .sort((a, b) => arCampaign(a).localeCompare(arCampaign(b)) || a.ad_name.localeCompare(b.ad_name, undefined, { numeric: true }));
  const metricRows = [
    ['CTR (All)', m => arCtr(m.ctr_all, 'all')],
    ['CTR (LCT)', m => arCtr(m.ctr_lct, 'lct')],
    ['Impressions', m => arInt(m.impressions)],
    ['Amount spent', m => arMoney(m.spent)],
    ['Leads', m => m.leads],
    ['CPL', m => (m.leads ? arMoney(m.cpl) : '—')]
  ];
  grid.innerHTML = `
    <table class="ar-grid">
      <thead><tr><th>Ad</th><th>Metric</th>${dates.map(date => `<th class="num">${arDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</th>`).join('')}</tr></thead>
      ${ads.map(ad => `
        <tbody>
          ${metricRows.map(([label, cell], index) => `
            <tr>
              ${index === 0 ? `<th scope="rowgroup" rowspan="${metricRows.length}"><strong>${arEsc(ad.ad_name)}</strong><small class="pd-sub">${arEsc(arCampaign(ad))}</small></th>` : ''}
              <td class="ar-grid-metric">${label}</td>
              ${dates.map(date => {
                const m = arMetrics(arSnapFor(ad.id, date));
                return `<td class="num">${m ? cell(m) : ''}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>`).join('')}
    </table>`;
}

// ── Import (IMPORT, LEADS, DATA LOG tabs) ────────────────────────────────────

// Decode UTF-8 or UTF-16 (Meta's lead export) and split CSV or TSV into objects.
async function arReadTable(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); records.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); records.push(row); }

  const rows = records.filter(record => record.some(value => value.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map(header => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

const arNum = value => {
  const n = Number(String(value ?? '').replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const arPick = (row, pattern) => row[Object.keys(row).find(key => pattern.test(key))] ?? '';
const arIsoDate = value => {
  const raw = String(value || '').trim();
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};

const arNorm = name => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();

function arDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Exact name first; otherwise the same "AD n" number with a near-identical name
// (Meta names drift: "biggest lie your" vs "biggest your"). Staff confirm every match.
function arMatchAd(name) {
  const norm = arNorm(name);
  const exact = arAds.find(ad => arNorm(ad.ad_name) === norm);
  if (exact) return exact;
  const number = arAdNo(name);
  if (!number) return null;
  const candidates = arAds
    .filter(ad => arAdNo(ad.ad_name) === number)
    .map(ad => ({ ad, distance: arDistance(arNorm(ad.ad_name), norm) }))
    .filter(({ distance }) => distance <= Math.max(4, Math.round(norm.length * 0.15)))
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.ad || null;
}

async function arPrepareAdsImport(file) {
  const rows = (await arReadTable(file)).map(row => {
    const indicator = arPick(row, /^result_indicator$/);
    const results = arNum(arPick(row, /^results$/));
    return {
      name: arPick(row, /^ad_name$/),
      adSet: arPick(row, /^ad_set_name$/),
      delivery: arPick(row, /^ad_delivery$/).toLowerCase(),
      start: arIsoDate(arPick(row, /^reporting_starts$/)),
      end: arIsoDate(arPick(row, /^reporting_ends$/)),
      created: arIsoDate(arPick(row, /^date_created$/)),
      impressions: arNum(arPick(row, /^impressions$/)),
      spent: arNum(arPick(row, /^amount_spent/)),
      leads: !indicator || /lead/i.test(indicator) ? results : 0,
      ctrAll: arNum(arPick(row, /^ctr_all$/)) / 100,        // Meta exports CTR in percent
      ctrLct: arNum(arPick(row, /^ctr_link_click_through_rate$/)) / 100
    };
  }).filter(row => row.name);

  if (!rows.length) throw new Error('No ads found. Export the ads table from Meta Ads Manager as CSV, with "Ad name" in it.');
  const reportDate = rows.find(row => row.end)?.end;
  if (!reportDate) throw new Error('This file has no "Reporting ends" column, so the report date is unknown.');

  rows.forEach(row => {
    const match = arMatchAd(row.name);
    const hasData = row.impressions > 0 || row.spent > 0;
    row.target = hasData ? (match ? String(match.id) : 'new') : 'skip';
    row.matchId = match ? String(match.id) : '';
  });
  arPendingImport = { kind: 'ads', rows, reportDate, rangeStart: rows.find(row => row.start)?.start || arAddDays(reportDate, -7) };
  arRenderPreview();
}

// The same lead: same Meta lead id, or same email (or phone, when there is no email).
const arLeadKeys = lead => [
  lead.id && `id:${lead.id}`,
  lead.email && `email:${arNorm(lead.email)}`,
  !lead.email && lead.phone && `phone:${String(lead.phone).replace(/^p:|[^\d+]/g, '')}`
].filter(Boolean);

async function arPrepareLeadsImport(file) {
  const rows = (await arReadTable(file)).filter(row => row.id);
  if (!rows.length) throw new Error('No leads found. Use the CSV or TSV downloaded from the Meta lead form.');
  // Form questions differ per ad, so only the contact and source columns are kept.
  const leads = rows.map(row => {
    const [first, ...rest] = String(row.full_name || '').split(' ');
    return {
      id: row.id,
      created_time: row.created_time || null,
      ad_name: row.ad_name || null,
      adset_name: row.adset_name || null,
      campaign_name: row.campaign_name || null,
      form_name: row.form_name || null,
      platform: row.platform || null,
      email: row.email || null,
      phone: row.phone || row.phone_number || null,
      first_name: row.first_name || first || null,
      last_name: row.last_name || rest.join(' ') || null
    };
  });
  // Skip anyone already on the list, and repeats inside this file.
  const seen = new Set(arLeads.flatMap(arLeadKeys));
  leads.forEach(lead => {
    const keys = arLeadKeys(lead);
    lead.duplicate = keys.some(key => seen.has(key));
    keys.forEach(key => seen.add(key));
  });
  arPendingImport = { kind: 'leads', rows: leads, fresh: leads.filter(lead => !lead.duplicate).length };
  arRenderPreview();
}

function arRenderPreview() {
  const card = document.getElementById('arPreviewCard');
  const pending = arPendingImport;
  card.hidden = !pending;
  if (!pending) return;

  if (pending.kind === 'leads') {
    const skipped = pending.rows.length - pending.fresh;
    document.getElementById('arPreviewTitle').textContent = `Import ${arPlural(pending.fresh, 'new lead')}`;
    document.getElementById('arPreviewLede').textContent = `${pending.fresh} new · ${skipped} already on the list, skipped (same lead id, or same email or phone).`;
    document.getElementById('arPreviewTable').innerHTML = `
      <table class="stack ar-table"><thead><tr><th>Lead</th><th>Received</th><th>Ad</th><th>Email</th><th>Status</th></tr></thead><tbody>${pending.rows.map(lead => `
        <tr class="${lead.duplicate ? 'ar-skipped' : ''}">
          <td data-label="Lead"><strong>${arEsc(arLeadName(lead))}</strong></td>
          <td data-label="Received">${lead.created_time ? arEsc(arStamp(lead.created_time)) : '—'}</td>
          <td data-label="Ad">${arEsc(lead.ad_name || '—')}</td>
          <td data-label="Email">${arEsc(lead.email || '—')}</td>
          <td data-label="Status">${lead.duplicate ? 'Already on the list' : '<strong>New</strong>'}</td>
        </tr>`).join('')}</tbody></table>`;
    return;
  }

  const counts = pending.rows.reduce((acc, row) => { acc[row.target === 'skip' ? 'skip' : row.target === 'new' ? 'fresh' : 'matched'] += 1; return acc; }, { matched: 0, fresh: 0, skip: 0 });
  const replacing = arSnaps.some(snap => snap.report_date === pending.reportDate);
  document.getElementById('arPreviewTitle').textContent = `Report ${arDate(pending.reportDate)}`;
  document.getElementById('arPreviewLede').textContent =
    `${arDmy(pending.rangeStart)} – ${arDmy(pending.reportDate)} · ${counts.matched} matched, ${counts.fresh} new, ${counts.skip} skipped (no impressions or spend).`
    + (replacing ? ' This date is already on file; imported ads replace their figures for it.' : '');
  const options = arAds.map(ad => `<option value="${ad.id}">${arEsc(ad.ad_name)}</option>`).join('');
  document.getElementById('arPreviewTable').innerHTML = `
    <table class="stack ar-table">
      <thead><tr><th>Ad in Meta export</th><th>Delivery</th><th class="num">Impressions</th><th class="num">Spent</th><th class="num">Leads</th><th class="num">CTR (All)</th><th class="num">CTR (LCT)</th><th>Save to</th></tr></thead>
      <tbody>${pending.rows.map((row, index) => `
        <tr class="${row.target === 'skip' ? 'ar-skipped' : ''}">
          <td data-label="Ad"><strong>${arEsc(row.name)}</strong><small class="pd-sub">${arEsc(row.adSet)}</small></td>
          <td data-label="Delivery">${arEsc(row.delivery || '—')}</td>
          <td class="num" data-label="Impressions">${arInt(row.impressions)}</td>
          <td class="num" data-label="Spent">${arMoney(row.spent)}</td>
          <td class="num" data-label="Leads">${row.leads}</td>
          <td class="num" data-label="CTR (All)">${arPct(row.ctrAll)}</td>
          <td class="num" data-label="CTR (LCT)">${arPct(row.ctrLct)}</td>
          <td data-label="Save to">
            <select data-preview-row="${index}" aria-label="Where to save ${arEsc(row.name)}">
              <option value="skip">Skip</option>
              <option value="new">New ad</option>
              <optgroup label="Existing ads">${options}</optgroup>
            </select>
            ${row.matchId && arNorm(arAds.find(ad => String(ad.id) === row.matchId)?.ad_name) !== arNorm(row.name) ? '<small class="pd-sub">Close name match, check it</small>' : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  document.querySelectorAll('[data-preview-row]').forEach(select => {
    select.value = pending.rows[Number(select.dataset.previewRow)].target;
  });
}

async function arConfirmImport() {
  const pending = arPendingImport;
  if (!pending) return;
  const button = document.getElementById('arPreviewConfirm');
  button.disabled = true;
  try {
    const client = await arClient();
    if (pending.kind === 'leads') {
      const fresh = pending.rows.filter(lead => !lead.duplicate).map(({ duplicate, ...lead }) => lead);
      if (!fresh.length) throw new Error('Every lead in this file is already on the list. Nothing to import.');
      // ignoreDuplicates: a lead id saved meanwhile is left untouched, never overwritten.
      const { error } = await client.from(AR_TABLES.leads).upsert(fresh, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      // Fill in missing campaigns on the Hub from the lead export.
      for (const ad of arAds.filter(item => !item.campaign)) {
        const campaign = pending.rows.find(lead => arNorm(lead.ad_name) === arNorm(ad.ad_name))?.campaign_name;
        if (campaign) await client.from(AR_TABLES.ads).update({ campaign }).eq('id', ad.id);
      }
      document.getElementById('arLeadsStatus').textContent = `Imported ${arPlural(fresh.length, 'new lead')}; ${pending.rows.length - fresh.length} already on the list were skipped.`;
    } else {
      const chosen = pending.rows.filter(row => row.target !== 'skip');
      if (!chosen.length) throw new Error('Every row is set to Skip. Choose where to save at least one ad.');

      // Create the "New ad" rows first.
      const fresh = chosen.filter(row => row.target === 'new');
      const uniqueNew = [...new Map(fresh.map(row => [arNorm(row.name), row])).values()];
      if (uniqueNew.length) {
        const { data, error } = await client.from(AR_TABLES.ads).insert(uniqueNew.map(row => ({
          ad_name: row.name,
          ad_set: row.adSet || null,
          campaign: arLeads.find(lead => arNorm(lead.ad_name) === arNorm(row.name))?.campaign_name || null,
          published_on: row.created || null,
          status: row.delivery === 'active' ? 'ACTIVE' : 'INACTIVE'
        }))).select();
        if (error) throw error;
        fresh.forEach(row => { row.target = String(data.find(ad => arNorm(ad.ad_name) === arNorm(row.name)).id); });
      }

      // Several export rows can map to one ad: add counts, weight CTRs by impressions.
      const byAd = new Map();
      chosen.forEach(row => {
        const acc = byAd.get(row.target) || { ad_id: Number(row.target), impressions: 0, amount_spent: 0, leads: 0, clicksAll: 0, clicksLct: 0, names: [], delivery: [] };
        acc.impressions += row.impressions;
        acc.amount_spent += row.spent;
        acc.leads += row.leads;
        acc.clicksAll += row.ctrAll * row.impressions;
        acc.clicksLct += row.ctrLct * row.impressions;
        acc.names.push(row.name);
        acc.delivery.push(row.delivery);
        byAd.set(row.target, acc);
      });
      const snapshots = [...byAd.values()].map(acc => ({
        ad_id: acc.ad_id,
        report_date: pending.reportDate,
        range_start: pending.rangeStart,
        impressions: Math.round(acc.impressions),
        amount_spent: Math.round(acc.amount_spent * 100) / 100,
        leads: Math.round(acc.leads),
        ctr_all: acc.impressions ? acc.clicksAll / acc.impressions : 0,
        ctr_lct: acc.impressions ? acc.clicksLct / acc.impressions : 0,
        imported_ad_name: acc.names.join(' + '),
        delivery: acc.delivery.includes('active') ? 'active' : acc.delivery[0] || null,
        imported_at: new Date().toISOString()
      }));
      const { error } = await client.from(AR_TABLES.snaps).upsert(snapshots, { onConflict: 'ad_id,report_date' });
      if (error) throw error;

      // Keep each ad's Hub status in step with Meta delivery.
      for (const snap of snapshots) {
        const status = snap.delivery === 'active' ? 'ACTIVE' : 'INACTIVE';
        if (snap.delivery && arAds.find(ad => ad.id === snap.ad_id)?.status !== status) {
          await client.from(AR_TABLES.ads).update({ status }).eq('id', snap.ad_id);
        }
      }
      document.getElementById('arAdsStatus').textContent = `Imported report ${arDate(pending.reportDate)}: ${arPlural(snapshots.length, 'ad')}.`;
      document.getElementById('arReportDate').value = pending.reportDate;
    }
    arPendingImport = null;
    await arLoad();
    arToast('Import complete.');
  } catch (error) {
    arToast(error.message || 'Import failed. Nothing was changed.', true);
  } finally {
    button.disabled = false;
  }
}

const arStamp = value => new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

// Import history (sheet: DATA LOG), one collapsible group per report date.
function arRenderLog() {
  const container = document.getElementById('arLogTable');
  const dates = arReportDates();
  document.getElementById('arLogCount').textContent = dates.length ? arPlural(dates.length, 'report') : '';
  if (!dates.length) {
    container.innerHTML = '<div class="empty">Nothing imported yet.</div>';
    return;
  }
  const open = new Set([...container.querySelectorAll('details[open]')].map(item => item.dataset.date));
  container.innerHTML = dates.map((date, index) => {
    const snaps = arSnaps.filter(snap => snap.report_date === date).sort((a, b) => b.impressions - a.impressions);
    const latest = snaps.reduce((last, snap) => (String(snap.imported_at) > String(last.imported_at) ? snap : last));
    const spend = snaps.reduce((sum, snap) => sum + Number(snap.amount_spent || 0), 0);
    const leads = snaps.reduce((sum, snap) => sum + Number(snap.leads || 0), 0);
    const isOpen = open.size ? open.has(date) : index === 0;
    return `
      <details class="past-due-log-group ar-log-group" data-date="${arEsc(date)}"${isOpen ? ' open' : ''}>
        <summary class="past-due-log-group-header">
          <h3>Report ${arDate(date)}</h3>
          <span class="past-due-log-group-summary"><strong>${arPlural(snaps.length, 'ad')}</strong><span>·</span><strong>${arMoney(spend)}</strong><span>·</span><strong>${arPlural(leads, 'lead')}</strong></span>
          <small class="ar-log-meta">Pushed ${arEsc(arStamp(latest.imported_at))}${latest.imported_by ? ` by ${arEsc(latest.imported_by)}` : ''}</small>
        </summary>
        <table class="stack ar-table">
          <thead><tr><th>Ad in export</th><th>Saved to</th><th class="num">Impressions</th><th class="num">Spent</th><th class="num">Leads</th><th class="num">CTR (All)</th><th class="num">CTR (LCT)</th></tr></thead>
          <tbody>${snaps.map(snap => {
            const saved = arAds.find(ad => ad.id === snap.ad_id)?.ad_name || '—';
            return `
            <tr>
              <td data-label="Ad in export">${arEsc(snap.imported_ad_name || '—')}</td>
              <td data-label="Saved to">${arNorm(saved) === arNorm(snap.imported_ad_name) ? '<span class="pd-muted">Same name</span>' : arEsc(saved)}</td>
              <td class="num" data-label="Impressions">${arInt(snap.impressions)}</td>
              <td class="num" data-label="Spent">${arMoney(snap.amount_spent)}</td>
              <td class="num" data-label="Leads">${snap.leads}</td>
              <td class="num" data-label="CTR (All)">${arPct(snap.ctr_all)}</td>
              <td class="num" data-label="CTR (LCT)">${arPct(snap.ctr_lct)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </details>`;
  }).join('');
}

// ── Leads tab: every lead ever imported ──────────────────────────────────────

const arLeadName = lead => [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead';
const arLeadAudience = lead => (/retarget/i.test(`${lead.campaign_name} ${lead.adset_name}`) ? 'Retargeting' : 'Broad');
const arLeadMonth = lead => (lead.created_time ? new Date(lead.created_time).toLocaleDateString('en-CA').slice(0, 7) : '');

function arFilteredLeads() {
  const query = arNorm(document.getElementById('arLeadSearch')?.value);
  const month = document.getElementById('arLeadMonth')?.value || '';
  const ad = document.getElementById('arLeadAd')?.value || '';
  const audience = document.getElementById('arLeadAudience')?.value || '';
  return arLeads
    .filter(lead => !query || [arLeadName(lead), lead.email, lead.phone].some(value => arNorm(value).includes(query)))
    .filter(lead => !month || arLeadMonth(lead) === month)
    .filter(lead => !ad || lead.ad_name === ad)
    .filter(lead => !audience || arLeadAudience(lead) === audience)
    .sort((a, b) => String(b.created_time).localeCompare(String(a.created_time)));
}

// Keep a filter's choice when its options are rebuilt after an import.
function arFillSelect(id, values, label = value => value) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.length = 1;
  select.insertAdjacentHTML('beforeend', values.map(value => `<option value="${arEsc(value)}">${arEsc(label(value))}</option>`).join(''));
  select.value = values.includes(current) ? current : '';
}

function arRenderLeads() {
  const container = document.getElementById('arLeadHistory');
  if (!container) return;
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const retargeting = arLeads.filter(lead => arLeadAudience(lead) === 'Retargeting').length;
  const byAd = arLeads.reduce((acc, lead) => { acc[lead.ad_name] = (acc[lead.ad_name] || 0) + 1; return acc; }, {});
  const [topAd, topCount] = Object.entries(byAd).sort((a, b) => b[1] - a[1])[0] || [];
  document.getElementById('arLeadMetrics').innerHTML = `
    <div class="past-due-metric key"><span>Leads on file</span><strong>${arLeads.length}</strong></div>
    <div class="past-due-metric"><span>This month</span><strong>${arLeads.filter(lead => arLeadMonth(lead) === thisMonth).length}</strong></div>
    <div class="past-due-metric"><span>Retargeting / broad</span><strong>${retargeting} / ${arLeads.length - retargeting}</strong></div>
    <div class="past-due-metric"><span>Top ad</span><strong>${topAd ? `${arEsc(arShortName(topAd))}<small>${arPlural(topCount, 'lead')}</small>` : '—'}</strong></div>`;

  arFillSelect('arLeadMonth', [...new Set(arLeads.map(arLeadMonth).filter(Boolean))].sort().reverse(), month => arDate(`${month}-01`, { month: 'long', year: 'numeric' }));
  arFillSelect('arLeadAd', [...new Set(arLeads.map(lead => lead.ad_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));

  const leads = arFilteredLeads();
  document.getElementById('arLeadCount').textContent = leads.length === arLeads.length ? arPlural(arLeads.length, 'lead') : `${leads.length} of ${arPlural(arLeads.length, 'lead')}`;
  if (!leads.length) {
    container.innerHTML = `<div class="empty">${arLeads.length ? 'No leads match these filters.' : 'No leads yet. Import the Meta leads export on the Import tab.'}</div>`;
    return;
  }
  container.innerHTML = `
    <table class="stack ar-table ar-lead-table">
      <thead><tr><th>Received</th><th>Lead</th><th>Source</th><th>Email</th><th>Phone</th></tr></thead>
      <tbody>${leads.map(lead => {
        const [line] = arLeadLines([lead]);
        const platform = { ig: 'Instagram', fb: 'Facebook' }[lead.platform] || lead.platform || 'Meta';
        return `
        <tr>
          <td data-label="Received">${lead.created_time ? arEsc(arStamp(lead.created_time)) : '—'}</td>
          <td data-label="Lead"><strong>${arEsc(arLeadName(lead))}</strong></td>
          <td data-label="Source">${arEsc(arLeadAudience(lead))}<small class="pd-sub">${arEsc(arShortName(lead.ad_name) || '—')} · ${arEsc(platform)}</small></td>
          <td data-label="Email">${lead.email ? `<a href="mailto:${arEsc(lead.email)}">${arEsc(lead.email)}</a>` : '—'}</td>
          <td data-label="Phone">${line.phone ? `<a href="tel:${arEsc(line.phone)}">${arEsc(line.phone)}</a>` : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function arExportLeads() {
  const leads = arFilteredLeads();
  if (!leads.length) { arToast('No leads to export.', true); return; }
  const columns = [['Received', lead => lead.created_time || ''], ['Name', arLeadName], ['Email', lead => lead.email || ''],
    ['Phone', lead => String(lead.phone || '').replace(/^p:/, '')], ['Audience', arLeadAudience], ['Ad', lead => lead.ad_name || ''],
    ['Campaign', lead => lead.campaign_name || ''], ['Platform', lead => lead.platform || '']];
  const csv = [columns.map(([head]) => head), ...leads.map(lead => columns.map(([, get]) => get(lead)))]
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `ad-review-leads-${new Date().toLocaleDateString('en-CA')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Playbook (SOP tab), editable ─────────────────────────────────────────────

const AR_MATRIX_HEAD = ['Pattern', 'Threshold', 'CTR (All)', 'CTR (LCT)', 'Leads', 'Diagnosis', 'Fix'];

// Saved content may predate a field; fill gaps from the defaults.
function arMergePlaybook(content) {
  const base = arClone(AR_PLAYBOOK_DEFAULT);
  if (!content) return base;
  return {
    rules: { ...base.rules, ...(content.rules || {}) },
    matrix: Array.isArray(content.matrix) ? content.matrix : base.matrix,
    lights: { ...base.lights, ...(content.lights || {}) },
    workflow: Array.isArray(content.workflow) ? content.workflow : base.workflow,
    notes: Array.isArray(content.notes) ? content.notes : base.notes
  };
}

const arPctText = value => `${Number(value).toFixed(2)}%`;

function arPlaybookViewHtml(pb) {
  const r = pb.rules;
  return `
    <div class="card">
      <h2>Rules the Hub applies</h2>
      <dl class="ar-summary ar-rules-view">
        <div><dt>Decision threshold</dt><dd>No decision until an ad reaches ${arEsc(Number(r.impressions).toLocaleString('en-AU'))} impressions.</dd></div>
        <div><dt>CTR (All) target</dt><dd>${arPctText(r.ctrAll)} or more is green; amber from ${arPctText(r.amberAll)}; below that is red.</dd></div>
        <div><dt>CTR (LCT) target</dt><dd>${arPctText(r.ctrLct)} or more is green; amber from ${arPctText(r.amberLct)}; below that is red.</dd></div>
      </dl>
    </div>

    <div class="card">
      <h2>Diagnostic matrix</h2>
      <div class="table-wrap">
        <table class="stack ar-table">
          <thead><tr>${AR_MATRIX_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${pb.matrix.map(row => `<tr>${row.map((cell, i) => `<td data-label="${AR_MATRIX_HEAD[i]}">${i === 0 ? `<strong>${arEsc(cell)}</strong>` : arEsc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="pd-tools">
      <div class="card">
        <h2>CTR traffic lights</h2>
        <div class="table-wrap">
          <table class="ar-lights-table">
            <thead><tr><th>Light</th><th>CTR (All)</th><th>CTR (LCT)</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><span class="ar-light is-red">Red</span></td><td>&lt; ${arPctText(r.amberAll)}</td><td>&lt; ${arPctText(r.amberLct)}</td><td>${arEsc(pb.lights.red)}</td></tr>
              <tr><td><span class="ar-light is-amber">Amber</span></td><td>${arPctText(r.amberAll)} – ${arPctText(r.ctrAll)}</td><td>${arPctText(r.amberLct)} – ${arPctText(r.ctrLct)}</td><td>${arEsc(pb.lights.amber)}</td></tr>
              <tr><td><span class="ar-light is-green">Green</span></td><td>≥ ${arPctText(r.ctrAll)}</td><td>≥ ${arPctText(r.ctrLct)}</td><td>${arEsc(pb.lights.green)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Responsibility workflow</h2>
        <ol class="ar-workflow">${pb.workflow.map(([stage, role, text]) => `<li><strong>${arEsc(stage)}</strong> · ${arEsc(role)}<span>${arEsc(text)}</span></li>`).join('')}</ol>
        ${pb.notes.length ? `<ul class="ar-rules">${pb.notes.map(([label, text]) => `<li><strong>${arEsc(label)}:</strong> ${arEsc(text)}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
}

const arField = (value, attrs = '') => `<input type="text" value="${arEsc(value)}" ${attrs}>`;
const arArea = (value, attrs = '') => `<textarea ${/\brows=/.test(attrs) ? '' : 'rows="2" '}${attrs}>${arEsc(value)}</textarea>`;
const arRemove = label => `<button type="button" class="pd-link" data-pb-remove aria-label="Remove ${arEsc(label)}">Remove</button>`;

function arPlaybookEditHtml(pb) {
  const r = pb.rules;
  const num = (key, label, step, suffix) => `
    <label><span>${label}</span>
      <span class="ar-num-field"><input type="number" min="0" step="${step}" data-pb-rule="${key}" value="${arEsc(r[key])}" required>${suffix ? `<small>${suffix}</small>` : ''}</span>
    </label>`;
  return `
    <div class="card">
      <h2>Rules the Hub applies</h2>
      <p class="pd-card-lede">These numbers drive every diagnosis, recommendation and traffic light on the report and the Hub.</p>
      <div class="ar-edit ar-rules-edit">
        ${num('impressions', 'Decision threshold', '1', 'impressions')}
        ${num('ctrAll', 'CTR (All) green from', '0.01', '%')}
        ${num('amberAll', 'CTR (All) amber from', '0.01', '%')}
        ${num('ctrLct', 'CTR (LCT) green from', '0.01', '%')}
        ${num('amberLct', 'CTR (LCT) amber from', '0.01', '%')}
      </div>
    </div>

    <div class="card">
      <div class="card-heading-row">
        <h2>Diagnostic matrix</h2>
        <button type="button" class="sop-action-button secondary pd-small" data-pb-add="matrix">Add row</button>
      </div>
      <p class="pd-card-lede">Reference text for staff. Update it to match if you change the rules above.</p>
      <div class="table-wrap">
        <table class="stack ar-table ar-pb-table">
          <thead><tr>${AR_MATRIX_HEAD.map(h => `<th>${h}</th>`).join('')}<th><span class="sr-only">Remove</span></th></tr></thead>
          <tbody data-pb-list="matrix">${pb.matrix.map(row => arMatrixRowEdit(row)).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="pd-tools">
      <div class="card">
        <h2>Traffic light meanings</h2>
        <div class="ar-edit">
          <label class="ar-edit-wide"><span>Red</span>${arField(pb.lights.red, 'data-pb-light="red"')}</label>
          <label class="ar-edit-wide"><span>Amber</span>${arField(pb.lights.amber, 'data-pb-light="amber"')}</label>
          <label class="ar-edit-wide"><span>Green</span>${arField(pb.lights.green, 'data-pb-light="green"')}</label>
        </div>
      </div>

      <div class="card">
        <div class="card-heading-row">
          <h2>Workflow</h2>
          <button type="button" class="sop-action-button secondary pd-small" data-pb-add="workflow">Add step</button>
        </div>
        <ol class="ar-pb-list" data-pb-list="workflow">${pb.workflow.map(arWorkflowEdit).join('')}</ol>
        <div class="card-heading-row ar-pb-subhead">
          <h2>Key rules</h2>
          <button type="button" class="sop-action-button secondary pd-small" data-pb-add="notes">Add rule</button>
        </div>
        <ul class="ar-pb-list" data-pb-list="notes">${pb.notes.map(arNoteEdit).join('')}</ul>
      </div>
    </div>`;
}

function arMatrixRowEdit(row = ['', '', '', '', '', '', '']) {
  return `<tr data-pb-item>${AR_MATRIX_HEAD.map((head, i) => `<td data-label="${head}">${i === 6 ? arArea(row[i], `rows="3" aria-label="${head}"`) : arField(row[i], `aria-label="${head}"`)}</td>`).join('')}<td data-label="">${arRemove('row')}</td></tr>`;
}

function arWorkflowEdit([stage, role, text] = ['', '', '']) {
  return `<li data-pb-item class="ar-pb-item">
    <label><span>Stage</span>${arField(stage, 'aria-label="Stage"')}</label>
    <label><span>Who</span>${arField(role, 'aria-label="Who"')}</label>
    <label class="ar-edit-wide"><span>What happens</span>${arArea(text, 'aria-label="What happens"')}</label>
    <div class="ar-edit-wide ar-pb-item-foot">${arRemove('step')}</div>
  </li>`;
}

function arNoteEdit([label, text] = ['', '']) {
  return `<li data-pb-item class="ar-pb-item">
    <label><span>Name</span>${arField(label, 'aria-label="Rule name"')}</label>
    <label class="ar-edit-wide"><span>Rule</span>${arArea(text, 'aria-label="Rule"')}</label>
    <div class="ar-edit-wide ar-pb-item-foot">${arRemove('rule')}</div>
  </li>`;
}

function arRenderPlaybook(force = false) {
  const body = document.getElementById('arPlaybook');
  if (arPlaybookEditing && !force) return; // never wipe an open edit
  const actions = document.getElementById('arPlaybookActions');
  const meta = document.getElementById('arPlaybookMeta');
  if (!body) return;
  meta.textContent = arPlaybookMeta
    ? `Last updated ${new Date(arPlaybookMeta.updated_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}${arPlaybookMeta.updated_by ? ` by ${arPlaybookMeta.updated_by}` : ''}`
    : 'Original playbook from the Google Sheet. Not edited yet.';
  actions.innerHTML = arPlaybookEditing
    ? `<button type="button" class="pd-link" id="arPbReset">Reset to original</button>
       <button type="button" class="sop-action-button secondary pd-small" id="arPbCancel">Cancel</button>
       <button type="button" class="sop-action-button primary pd-small" id="arPbSave">Save playbook</button>`
    : '<button type="button" class="sop-action-button primary pd-small" id="arPbEdit">Edit playbook</button>';
  body.innerHTML = arPlaybookEditing ? arPlaybookEditHtml(arPlaybook) : arPlaybookViewHtml(arPlaybook);
}

function arCollectPlaybook() {
  const body = document.getElementById('arPlaybook');
  const values = item => [...item.querySelectorAll('input, textarea')].map(input => input.value.trim());
  const rules = {};
  body.querySelectorAll('[data-pb-rule]').forEach(input => { rules[input.dataset.pbRule] = Number(input.value); });
  const lights = {};
  body.querySelectorAll('[data-pb-light]').forEach(input => { lights[input.dataset.pbLight] = input.value.trim(); });
  const list = name => [...body.querySelectorAll(`[data-pb-list="${name}"] > [data-pb-item]`)].map(values).filter(row => row.some(Boolean));
  return { rules, matrix: list('matrix'), lights, workflow: list('workflow'), notes: list('notes') };
}

function arValidatePlaybook(pb) {
  const r = pb.rules;
  if (!(r.impressions >= 1)) return 'The decision threshold must be at least 1 impression.';
  for (const key of ['ctrAll', 'amberAll', 'ctrLct', 'amberLct']) {
    if (!(r[key] >= 0 && r[key] <= 100)) return 'CTR values must be percentages between 0 and 100.';
  }
  if (r.amberAll > r.ctrAll) return 'CTR (All): amber must start at or below green.';
  if (r.amberLct > r.ctrLct) return 'CTR (LCT): amber must start at or below green.';
  return '';
}

async function arSavePlaybook() {
  const content = arCollectPlaybook();
  const problem = arValidatePlaybook(content);
  if (problem) { arToast(problem, true); return; }
  const button = document.getElementById('arPbSave');
  button.disabled = true;
  try {
    const client = await arClient();
    const { data, error } = await client.from(AR_TABLES.playbook)
      .upsert({ id: 1, content }, { onConflict: 'id' })
      .select().single();
    if (error) throw error;
    arPlaybook = arMergePlaybook(data.content);
    arPlaybookMeta = data;
    arPlaybookEditing = false;
    arRender();
    arToast('Playbook saved. The report and Hub now use these rules.');
  } catch (error) {
    button.disabled = false;
    const missing = /does not exist|schema cache/i.test(error.message || '');
    arToast(missing ? 'Run the updated supabase/ad_review.sql to enable playbook editing.' : (error.message || 'Could not save the playbook.'), true);
  }
}

function arOnPlaybookClick(event) {
  const target = event.target;
  if (target.closest('#arPbEdit')) { arPlaybookEditing = true; arRenderPlaybook(true); return; }
  if (target.closest('#arPbCancel')) {
    if (!window.confirm('Discard your playbook changes?')) return;
    arPlaybookEditing = false;
    arRenderPlaybook(true);
    return;
  }
  if (target.closest('#arPbReset')) {
    if (!window.confirm('Fill the form with the original playbook from the Google Sheet? Nothing is saved until you press Save.')) return;
    document.getElementById('arPlaybook').innerHTML = arPlaybookEditHtml(arClone(AR_PLAYBOOK_DEFAULT));
    return;
  }
  if (target.closest('#arPbSave')) { arSavePlaybook(); return; }
  const add = target.closest('[data-pb-add]')?.dataset.pbAdd;
  if (add) {
    const html = { matrix: arMatrixRowEdit, workflow: arWorkflowEdit, notes: arNoteEdit }[add]();
    const listEl = document.querySelector(`[data-pb-list="${add}"]`);
    listEl.insertAdjacentHTML('beforeend', html);
    listEl.lastElementChild.querySelector('input, textarea')?.focus();
    return;
  }
  if (target.closest('[data-pb-remove]')) target.closest('[data-pb-item]').remove();
}

// ── Page ─────────────────────────────────────────────────────────────────────

function arRender() {
  const select = document.getElementById('arReportDate');
  const dates = arReportDates();
  const current = dates.includes(select.value) ? select.value : dates[0] || '';
  select.innerHTML = dates.length
    ? dates.map(date => `<option value="${date}"${date === current ? ' selected' : ''}>${arDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>`).join('')
    : '<option value="">No reports yet</option>';

  const updated = document.getElementById('updatedLine');
  if (updated) updated.textContent = dates.length ? `Latest report ${arDate(dates[0])}` : 'No reports imported yet';

  if (current) {
    const { start } = arRange(current);
    document.getElementById('arRange').textContent = `Meta data ${arDate(start)} – ${arDate(current)} (rolling 7 days)`;
    arRenderReport(current);
    arRenderHub(current);
  } else {
    document.getElementById('arRange').textContent = 'Import a Meta ads report to begin.';
    ['arThresholdTable', 'arUnderTable', 'arLeadTable', 'arActiveTable', 'arInactiveTable'].forEach(id => {
      document.getElementById(id).innerHTML = '<div class="empty">No reports yet. Use the Import tab to add the first Meta ads report.</div>';
    });
    ['arReportMetrics', 'arHubMetrics', 'arSummary', 'arSteps'].forEach(id => { document.getElementById(id).innerHTML = ''; });
  }
  arRenderMonth();
  arRenderLog();
  arRenderLeads();
  arRenderPlaybook();
}

function arInit() {
  const tabs = document.querySelectorAll('nav.site-nav button');
  tabs.forEach(button => button.addEventListener('click', () => {
    tabs.forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${button.dataset.tab}`));
    // The report date applies to the Report and Hub tabs only.
    document.getElementById('arToolbar').hidden = !['report', 'hub'].includes(button.dataset.tab);
  }));

  document.getElementById('arReportDate').addEventListener('change', arRender);
  document.getElementById('arMonth').addEventListener('change', arRenderMonth);

  document.getElementById('arCopyBtn').addEventListener('click', async () => {
    const date = arSelectedDate();
    if (!date) return;
    try {
      await navigator.clipboard.writeText(arSlackText(date));
      arToast('Report copied. Paste it into Slack.');
    } catch {
      arToast('Copying was blocked by the browser. Try again.', true);
    }
  });

  const main = document.querySelector('.ad-review-main');
  main.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-action-ad]')) arSaveAction(target);
    else if (target.matches('[data-ad-field]')) arSaveAdField(target);
    else if (target.matches('[data-preview-row]')) {
      arPendingImport.rows[Number(target.dataset.previewRow)].target = target.value;
      target.closest('tr').classList.toggle('ar-skipped', target.value === 'skip');
    }
  });
  main.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-ad]');
    if (deleteButton) { arDeleteAd(Number(deleteButton.dataset.deleteAd)); return; }
    const row = event.target.closest('.parent-row');
    if (row && (event.target.closest('.toggle-btn') || !event.target.closest('button, a, input, select, textarea, label'))) {
      const id = Number(row.dataset.ad);
      const detail = row.nextElementSibling;
      const open = detail.hidden;
      detail.hidden = !open;
      row.classList.toggle('is-open', open);
      row.querySelector('.toggle-btn').setAttribute('aria-expanded', String(open));
      if (open) arOpen.add(id); else arOpen.delete(id);
    }
  });

  document.getElementById('tab-playbook').addEventListener('click', arOnPlaybookClick);
  arRenderPlaybook();

  document.querySelectorAll('[data-pick]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.pick).click()));
  [['arAdsFile', 'arAdsStatus', arPrepareAdsImport], ['arLeadsFile', 'arLeadsStatus', arPrepareLeadsImport]].forEach(([inputId, statusId, prepare]) => {
    const input = document.getElementById(inputId);
    const drop = document.querySelector(`[data-pick="${inputId}"]`);
    const handle = async file => {
      if (!file) return;
      const status = document.getElementById(statusId);
      status.classList.remove('upload-status-error');
      status.textContent = `Reading ${file.name}…`;
      try {
        await prepare(file);
        status.textContent = `${file.name}: check the rows below, then import.`;
        document.getElementById('arPreviewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        status.textContent = error.message || 'Could not read that file.';
        status.classList.add('upload-status-error');
      }
    };
    input.addEventListener('change', () => {
      const file = input.files[0];
      input.value = '';
      handle(file);
    });
    drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', event => {
      event.preventDefault();
      drop.classList.remove('is-over');
      handle(event.dataTransfer.files[0]);
    });
  });

  ['arLeadSearch', 'arLeadMonth', 'arLeadAd', 'arLeadAudience'].forEach(id => document.getElementById(id).addEventListener('input', arRenderLeads));
  document.getElementById('arLeadExport').addEventListener('click', arExportLeads);
  document.getElementById('arPreviewConfirm').addEventListener('click', arConfirmImport);
  document.getElementById('arPreviewCancel').addEventListener('click', () => {
    arPendingImport = null;
    arRenderPreview();
  });

  arLoad().catch(error => {
    document.querySelectorAll('.ad-review-main .table-wrap[id]').forEach(container => {
      container.innerHTML = `<div class="error">${arEsc(error.message)}</div>`;
    });
    document.getElementById('updatedLine').textContent = 'Could not load the ad review';
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arInit);
else arInit();
