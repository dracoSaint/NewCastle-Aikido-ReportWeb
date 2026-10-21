// Starts a Zen Planner job on GitHub Actions for the portal's sync buttons. Signed-in portal users only.
//   {}                 -> .github/workflows/zenplanner-pastdue.yml (Past Due "Sync now")
//   { job: 'monday' }  -> .github/workflows/zenplanner-monday.yml  (Monday report "Sync data")
//   { job: 'followup' } -> .github/workflows/zenplanner-followup.yml (Red/Orange "Sync now": refreshes
//                         today's list in place, keeping its notes)
//
// Deploy:  supabase functions deploy run-pastdue-sync
// Secret:  supabase secrets set GITHUB_TOKEN=<fine-grained token: this repo only, Actions read & write>
import { createClient } from 'npm:@supabase/supabase-js@2';

const REPO = 'https://api.github.com/repos/dracoSaint/NewCastle-Aikido-ReportWeb/actions/workflows';
const JOBS: Record<string, string> = { pastdue: 'zenplanner-pastdue.yml', monday: 'zenplanner-monday.yml', followup: 'zenplanner-followup.yml', grading: 'zenplanner-grading.yml' };
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Sign in first.', { status: 401, headers: cors });

  const { job = 'pastdue' } = await req.json().catch(() => ({}));
  const workflow = Object.hasOwn(JOBS, job) ? JOBS[job] : null;
  if (!workflow) return new Response('Unknown job.', { status: 400, headers: cors });

  // Settings: the role needs "Press Sync buttons", the bot must be switched on, and the cooldown
  // must have passed (supabase/access_control.sql). Before that's set up, any signed-in user may sync.
  const { error: claimError } = await supabase.rpc('claim_bot_run', { p_job: job, p_scheduled: false });
  if (claimError && claimError.code !== 'PGRST202') { // PGRST202: function not created yet
    return new Response(claimError.message, { status: claimError.code === '42501' ? 403 : 409, headers: cors });
  }

  const res = await fetch(`${REPO}/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'zenplanner-sync'
    },
    // The follow-up job skips a day already saved unless forced; a button press always re-pulls.
    body: JSON.stringify({ ref: 'production', ...(job === 'followup' ? { inputs: { force: true } } : {}) })
  });
  if (!res.ok) console.error('GitHub dispatch failed', workflow, res.status, await res.text());
  return new Response(res.ok ? 'started' : 'Could not start the sync.', { status: res.ok ? 200 : 502, headers: cors });
});
