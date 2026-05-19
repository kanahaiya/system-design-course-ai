import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FeedbackPayload = {
  type: string;
  email: string;
  message: string;
  company?: string;
  sourcePage?: string;
  submittedAtIso?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let payload: FeedbackPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const type = String(payload.type ?? '').trim().toLowerCase();
  const email = String(payload.email ?? '').trim().toLowerCase();
  const message = String(payload.message ?? '').trim();
  const company = String(payload.company ?? '').trim();
  const sourcePage = String(payload.sourcePage ?? '').trim();
  const submittedAtIso = String(payload.submittedAtIso ?? '').trim();

  if (type !== 'feedback' && type !== 'bug') {
    return jsonResponse(400, { error: 'Type must be feedback or bug' });
  }
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Invalid email' });
  }
  if (message.length < 10) {
    return jsonResponse(400, { error: 'Message is too short' });
  }
  if (message.length > 3000) {
    return jsonResponse(400, { error: 'Message is too long' });
  }
  if (company.length > 0) {
    return jsonResponse(400, { error: 'Spam detected' });
  }
  const detectedLinks = (message.match(/https?:\/\//gi) ?? []).length;
  if (detectedLinks > 3) {
    return jsonResponse(400, { error: 'Too many links in message' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return jsonResponse(500, { error: 'Missing Supabase env config' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const tenMinutesAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await supabase
    .from('launch_feedback')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', tenMinutesAgoIso);

  if (rateLimitError !== null) {
    return jsonResponse(500, { error: 'Rate limit check failed', detail: rateLimitError.message });
  }

  if ((count ?? 0) >= 5) {
    return jsonResponse(429, { error: 'Too many requests. Please try again later.' });
  }

  const { error } = await supabase
    .from('launch_feedback')
    .insert({
      feedback_type: type,
      email,
      message,
      source_page: sourcePage.length > 0 ? sourcePage : null,
      submitted_at_iso: submittedAtIso.length > 0 ? submittedAtIso : null,
    });

  if (error !== null) {
    return jsonResponse(500, { error: 'Database insert failed', detail: error.message });
  }

  return jsonResponse(200, { success: true });
});
