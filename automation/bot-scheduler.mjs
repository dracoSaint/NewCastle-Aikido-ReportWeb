// Every 30 minutes (.github/workflows/bot-scheduler.yml): starts each Zen Planner bot whose run
// time (Sydney) has passed today and that hasn't started since, as set in Settings > Bots
// (table bot_settings). A bot switched off there never starts.
//
// Secrets: BOT_EMAIL, BOT_PASSWORD (that account's role needs the bots.schedule switch),
// GITHUB_TOKEN (the workflow's own token, allowed to start the bot workflows).
// Local test (nothing started): DRY_RUN=1 node --env-file=automation/.env automation/bot-scheduler.mjs

import { pathToFileURL } from 'node:url';

const WORKFLOWS = { followup: 'zenplanner-followup.yml', pastdue: 'zenplanner-pastdue.yml', monday: 'zenplanner-monday.yml', grading: 'zenplanner-grading.yml' };
const CATCH_UP_MINUTES = 180; // GitHub sometimes skips a scheduled run; catch up for 3 hours, no longer.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Sydney weekday (0 = Sunday) and minutes past midnight.
export function sydneyClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { day: WEEKDAYS.indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Bots to start now: switched on, today is a run day, the run time passed less than 3 hours ago,
// and nothing (scheduler or Sync button) has started it since that time.
export function botsDue(settings, now = new Date()) {
  const { day, minutes } = sydneyClock(now);
  return settings.filter(bot => {
    const [hour, minute] = String(bot.run_time).split(':').map(Number);
    const late = minutes - (hour * 60 + minute);
    if (!bot.enabled || !bot.run_days.includes(day) || late < 0 || late >= CATCH_UP_MINUTES) return false;
    const scheduledAt = now.getTime() - late * 60000 - (now.getTime() % 60000);
    return !bot.last_started_at || Date.parse(bot.last_started_at) < scheduledAt;
  });
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const env = name => {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
    return process.env[name];
  };
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  const { data: settings, error } = await supabase.from('bot_settings').select('*');
  if (error) throw new Error(`Could not read bot settings (run supabase/access_control.sql): ${error.message}`);
  const due = botsDue(settings);
  if (!due.length) {
    console.log('No bots due.');
    return;
  }

  let failed = false;
  for (const bot of due) {
    if (process.env.DRY_RUN) {
      console.log(`DRY_RUN: would start ${bot.job}.`);
      continue;
    }
    const { error: claimError } = await supabase.rpc('claim_bot_run', { p_job: bot.job, p_scheduled: true });
    if (claimError) {
      console.log(`${bot.job}: not started (${claimError.message})`);
      continue;
    }
    const response = await fetch(`https://api.github.com/repos/${env('GITHUB_REPOSITORY')}/actions/workflows/${WORKFLOWS[bot.job]}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('GITHUB_TOKEN')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bot-scheduler' },
      // The follow-up job's "force" input re-pulls a day already saved; a scheduled run never forces.
      // Bots run the production branch (the repo's default since 2026-10-21; main is Netlify only).
      body: JSON.stringify({ ref: 'production', ...(bot.job === 'followup' ? { inputs: { force: false } } : {}) })
    });
    if (response.ok) console.log(`${bot.job}: started.`);
    else {
      failed = true;
      console.error(`${bot.job}: GitHub refused to start it (${response.status}) ${await response.text()}`);
    }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
