// Starts the Zen Planner past due job (.github/workflows/zenplanner-pastdue.yml) for the
// Past Due page's "Sync now" button. Signed-in portal users only.
//
// Deploy:  supabase functions deploy run-pastdue-sync
// Secret:  supabase secrets set GITHUB_TOKEN=<fine-grained token: this repo only, Actions read & write>
import { createClient } from 'npm:@supabase/supabase-js@2';

const WORKFLOW = 'https://api.github.com/repos/dracoSaint/NewCastle-Aikido-ReportWeb/actions/workflows/zenplanner-pastdue.yml/dispatches';
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

  const res = await fetch(WORKFLOW, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'past-due-sync'
    },
    body: JSON.stringify({ ref: 'main' })
  });
  if (!res.ok) console.error('GitHub dispatch failed', res.status, await res.text());
  return new Response(res.ok ? 'started' : 'Could not start the sync.', { status: res.ok ? 200 : 502, headers: cors });
});
