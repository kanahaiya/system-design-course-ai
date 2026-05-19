/**
 * Phase 0.5 runtime launch config.
 * Fill with real values for production wiring.
 */
window.SD_LAUNCH_CONFIG = {
  ga4MeasurementId: '',
  supabaseAuth: {
    url: '',
    anonKey: '',
  },
  customerPortalUrl: '',
  checkoutUrls: {
    proMonthly: '',
    proYearly: '',
  },
  formEndpoints: {
    waitlist: '',
    feedback: '',
    entitlement: '',
  },
  formProviders: {
    waitlist: {
      provider: '',
      endpoint: '',
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
