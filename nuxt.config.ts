// * Nuxt 4 LTS config — Intersport Club IDF e-shop
// ? npx netlify-cli build && npx netlify-cli deploy --prod
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    // * Tailwind v4 is pulled in by @nuxt/ui via @tailwindcss/vite —
    // * no separate tailwind module, theme is defined in assets/css/main.css.
    '@nuxtjs/supabase',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@vueuse/nuxt',
    '@nuxtjs/color-mode',
  ],

  // * Back-office is client-only. Admin pages mutate local refs inside
  // *   useAsyncData (loading/requests/eventLog/...) which Nuxt doesn't
  // *   serialize, so SSR vs hydration drift caused hydration mismatches and
  // *   stuck loading states. `ssr: false` in definePageMeta is NOT a real
  // *   Nuxt option — routeRules is. Storefront keeps SSR for SEO.
  routeRules: {
    '/admin/**': { ssr: false },
  },

  css: ['~/assets/css/main.css'],

  supabase: {
    // * Keys read from env: SUPABASE_URL, SUPABASE_KEY
    // * redirect: false — authentication gates are handled by our custom
    // * middlewares (admin.ts, backoffice.ts, auth.ts, customer-only.ts)
    // * because admin routes must redirect to /admin/login, not /login.
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [
        '/',
        '/catalog',
        '/contact',
        '/login',
        '/register',
        '/admin/login',
        '/sport/*',
        '/club/*',
        '/product/*',
      ],
    },
  },

  i18n: {
    // * Nuxt 4 + @nuxtjs/i18n v10 default dir is i18n/locales/
    locales: [
      { code: 'fr', file: 'fr.json', name: 'Français' },
      { code: 'en', file: 'en.json', name: 'English' },
    ],
    defaultLocale: 'fr',
    // lazy: true,
    strategy: 'no_prefix',
    // * Auto-detect the browser language; fall back to French when the browser
    // * asks for anything that isn't in `locales`. User's manual toggle is
    // * remembered via the i18n_redirected cookie.
    detectBrowserLanguage: {
      useCookie: true,
      fallbackLocale: 'fr',
    },
  },

  colorMode: { classSuffix: '', preference: 'system', fallback: 'light' },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'layout', mode: 'out-in' },
    head: {
      title: 'Intersport Club IDF',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Sora:wght@300;400;500;600;700&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    // * Server-only — never exposed to client
    paymentProvider: process.env.PAYMENT_PROVIDER || 'card',
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    colissimoApiKey: process.env.COLISSIMO_API_KEY || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    public: {
      // * Exposed to client — only publishable values
      paymentProvider: process.env.PAYMENT_PROVIDER || 'card',
      systempayEndpoint: process.env.NUXT_PUBLIC_SYSTEMPAY_ENDPOINT || '',
      systempayPublicKey: process.env.NUXT_PUBLIC_SYSTEMPAY_PUBLIC_KEY,
      paypalClientId: process.env.NUXT_PUBLIC_PAYPAL_CLIENT_ID || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_KEY,
    },
  },
})
