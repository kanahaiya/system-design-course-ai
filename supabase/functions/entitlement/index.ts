import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token.length === 0) {
    return jsonResponse(401, { error: 'Missing bearer token' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return jsonResponse(500, { error: 'Missing Supabase env config' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const userResult = await adminClient.auth.getUser(token);
  const userId = userResult.data.user?.id ?? null;
  if (userResult.error !== null || userId === null) {
    return jsonResponse(401, { error: 'Invalid auth token' });
  }

  const entitlementResult = await adminClient
    .from('user_entitlements')
    .select('plan,status,expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entitlementResult.error !== null) {
    return jsonResponse(500, { error: 'Entitlement lookup failed', detail: entitlementResult.error.message });
  }

  const entitlement = entitlementResult.data;
  if (entitlement === null) {
    return jsonResponse(200, { plan: 'free', status: 'inactive' });
  }

  const expiresAt = entitlement.expires_at as string | null;
  if (expiresAt !== null) {
    const expiryTime = Date.parse(expiresAt);
    if (!Number.isNaN(expiryTime) && expiryTime < Date.now()) {
      return jsonResponse(200, { plan: 'free', status: 'expired' });
    }
  }

  return jsonResponse(200, {
    plan: entitlement.plan,
    status: entitlement.status,
    expiresAt,
  });
});
