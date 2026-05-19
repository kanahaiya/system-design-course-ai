/**
 * Copy this file to `assets/js/launch-config.js` and fill actual values.
 * This file is safe to commit. Do not commit secrets in launch-config.js.
 */
window.SD_LAUNCH_CONFIG = {
  // Example: "G-XXXXXXXXXX"
  ga4MeasurementId: '',
  supabaseAuth: {
    // Example: "https://yourproject.supabase.co"
    url: '',
    // Public anon key (not service role key)
    anonKey: '',
  },
  customerPortalUrl: '',
  checkoutUrls: {
    proMonthly: '',
    proYearly: '',
  },
  formEndpoints: {
    // Example Formspree endpoint: "https://formspree.io/f/abcdwxyz"
    waitlist: '',
    // Example Supabase Edge Function endpoint
    feedback: '',
    entitlement: '',
  },
  formProviders: {
    // Optional provider-specific config. If present, this takes priority over formEndpoints.
    waitlist: {
      // "formspree" or "supabase"
      provider: '',
      endpoint: '',
      // Required only for supabase provider
      anonKey: '',
    },
    feedback: {
      provider: '',
      endpoint: '',
      anonKey: '',
    },
    entitlement: {
      provider: 'supabase',
      endpoint: '',
      anonKey: '',
    },
  },
};
