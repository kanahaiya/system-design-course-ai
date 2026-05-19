# Supabase Wiring Guide (Phase 0.5)

This folder provides production-ready wiring for:
- Waitlist submissions (`waitlist` function)
- Feedback/bug submissions (`feedback` function)
- Entitlement verification (`entitlement` function)
- Basic abuse controls:
  - Honeypot field (`company`) spam trap
  - Email-based rate limiting (rolling 10-minute window)
  - Feedback content guardrails (length + link count)

## 1) Create DB tables

Run SQL in Supabase SQL Editor:
- `supabase/sql/001_phase0_forms.sql`

## 2) Deploy Edge Functions

From project root:

```bash
supabase functions deploy waitlist --project-ref <project-ref>
supabase functions deploy feedback --project-ref <project-ref>
supabase functions deploy entitlement --project-ref <project-ref>
```

## 3) Set function secrets

```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co --project-ref <project-ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key> --project-ref <project-ref>
```

## 4) Configure frontend runtime

Edit `assets/js/launch-config.js`:

```javascript
window.SD_LAUNCH_CONFIG = {
  ga4MeasurementId: 'G-XXXXXXXXXX',
  supabaseAuth: {
    url: 'https://<project-ref>.supabase.co',
    anonKey: '<public-anon-key>',
  },
  checkoutUrls: {
    proMonthly: 'https://<checkout-link-monthly>',
    proYearly: 'https://<checkout-link-yearly>',
  },
  customerPortalUrl: 'https://<billing-portal-link>',
  formProviders: {
    waitlist: {
      provider: 'supabase',
      endpoint: 'https://<project-ref>.supabase.co/functions/v1/waitlist',
      anonKey: '<public-anon-key>',
    },
    feedback: {
      provider: 'supabase',
      endpoint: 'https://<project-ref>.supabase.co/functions/v1/feedback',
      anonKey: '<public-anon-key>',
    },
    entitlement: {
      provider: 'supabase',
      endpoint: 'https://<project-ref>.supabase.co/functions/v1/entitlement',
      anonKey: '<public-anon-key>',
    },
  },
};
```

## 5) Smoke test

- Submit waitlist from home page.
- Submit feedback from feedback page.
- Confirm rows in `launch_waitlist` and `launch_feedback`.
- Sign in from account page and verify entitlement response for a paid user.

## 6) Export data as CSV

Use the included script:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/export-launch-data.mjs
```

Optional:

```bash
EXPORT_DIR=./exports node scripts/export-launch-data.mjs
```

Outputs:
- `exports/waitlist-<timestamp>.csv`
- `exports/feedback-<timestamp>.csv`
