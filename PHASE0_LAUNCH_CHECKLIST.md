# Phase 0 Launch Checklist

## Custom Domain + SSL
- Point DNS `A`/`CNAME` to your static host.
- Configure custom domain in hosting settings.
- Force HTTPS and verify valid TLS certificate.

## Analytics
- Configure `assets/js/launch-config.js`:
  - `ga4MeasurementId` = your GA4 Measurement ID (e.g. `G-XXXXXX`)
- Local analytics events are stored in `localStorage` key: `sdcourse_analytics_events_v1`.

## Waitlist + Email Capture
- Waitlist form is available on `index.html`.
- Entries are stored in browser local storage under `sdcourse_waitlist_v1`.
- Configure remote form endpoint in `assets/js/launch-config.js` under `formEndpoints.waitlist`.

## Legal + Feedback
- Privacy: `legal/privacy.html`
- Terms: `legal/terms.html`
- Refund: `legal/refund.html`
- Feedback/Bug report: `feedback/index.html`
- Configure remote form endpoint in `assets/js/launch-config.js` under `formEndpoints.feedback`.

## SEO
- `sitemap.xml` and `robots.txt` added.
- Update `sitemap.xml` if major pages are added or removed.

## Phase 0.5 Production Wiring
- Use `assets/js/launch-config.example.js` as the reference format.
- Keep `assets/js/launch-config.js` environment-specific.
- For hosted production, fill GA4 + form endpoints and redeploy.

### Option A — Formspree
```javascript
window.SD_LAUNCH_CONFIG = {
  ga4MeasurementId: 'G-XXXXXXXXXX',
  formProviders: {
    waitlist: { provider: 'formspree', endpoint: 'https://formspree.io/f/xxxxxx' },
    feedback: { provider: 'formspree', endpoint: 'https://formspree.io/f/yyyyyy' },
  },
};
```

### Option B — Supabase Edge Functions
```javascript
window.SD_LAUNCH_CONFIG = {
  ga4MeasurementId: 'G-XXXXXXXXXX',
  supabaseAuth: {
    url: 'https://<project>.supabase.co',
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
      endpoint: 'https://<project>.supabase.co/functions/v1/waitlist',
      anonKey: '<public-anon-key>',
    },
    feedback: {
      provider: 'supabase',
      endpoint: 'https://<project>.supabase.co/functions/v1/feedback',
      anonKey: '<public-anon-key>',
    },
    entitlement: {
      provider: 'supabase',
      endpoint: 'https://<project>.supabase.co/functions/v1/entitlement',
      anonKey: '<public-anon-key>',
    },
  },
};
```

### Supabase deployment shortcuts
- SQL schema: `supabase/sql/001_phase0_forms.sql`
- Function code:
  - `supabase/functions/waitlist/index.ts`
  - `supabase/functions/feedback/index.ts`
  - `supabase/functions/entitlement/index.ts`
- Full deploy instructions: `supabase/README.md`
