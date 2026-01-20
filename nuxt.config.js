import { schemaWebSite } from './utils/schema'
import Re_L from './assets/presets/re_l'

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',

    devtools: { enabled: true },

    css: ['primeicons/primeicons.css', './assets/css/fonts.css', './assets/css/main.css'],

    modules: ['@nuxtjs/i18n', '@primevue/nuxt-module', '@nuxtjs/tailwindcss', '@pinia/nuxt'],

    imports: {
        dirs: ['stores']
    },

    primevue: {
        options: {
            theme: {
                preset: Re_L,
                options: {
                    darkModeSelector: '.dark-mode',
                },
            },
        },
    },

    i18n: {
        locales: [
            { code: 'en', file: 'en.json', name: 'English' },
            { code: 'ru', file: 'ru.json', name: 'Русский' },
        ],
        defaultLocale: 'ru',
        lazy: true,
        langDir: 'locales/',
        strategy: 'no_prefix',
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: 'i18n_locale',
            redirectOn: 'root',
            alwaysRedirect: false,
        },
    },

    typescript: {
        strict: false,
        typeCheck: false,
    },

    runtimeConfig: {
        // Railway: Set NUXT_MONGODB_URI in environment variables
        // The NUXT_ prefix allows runtime override
        mongoUri: process.env.NUXT_MONGODB_URI || process.env.MONGODB_URI || '',
        stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
        resendToken: process.env.RESEND_TOKEN || '',
        public: {
            baseUrl: process.env.BASE_URL || 'http://localhost:3000',
            gitCommitSha: process.env.GIT_COMMIT_SHA || '',
        },
    },

    vite: {
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `
                        @import "./assets/scss/variables.scss";
                        @import "./assets/scss/mixins.scss";
                        @import "./assets/scss/fonts.scss";
                        @import "./assets/scss/global.scss";
                    `,
                },
            },
        },
        build: {
            minify: 'terser',
            chunkSizeWarningLimit: 1000,
        },
        optimizeDeps: {
            include: [
                'primevue/menubar',
                'primevue/divider',
                'primevue/button',
                'primevue/select',
                'primevue/menu',
                'primevue/avatar',
                'primevue/inputtext',
                'primevue/dataview',
                'primevue/card',
                'primevue/tag',
                'primevue/dialog',
                'primevue/progressspinner',
                'primevue/tabview',
                'primevue/tabpanel',
                'primevue/toast',
                'primevue/fileupload',
                'primevue/confirmdialog',
                'primevue/useconfirm',
                'primevue/usetoast',
                'primevue/textarea',
                'primevue/inputnumber',
                'primevue/checkbox',
                'primevue/inplace',
                'primevue/chip',
                'primevue/accordion',
                'primevue/accordiontab',
                'primevue/password',
                'primevue/tabs',
                'primevue/tablist',
                'primevue/tab',
                'primevue/tabpanels'
            ],
            exclude: ['nodi-modular']
        },
        server: {
            fs: {
                allow: ['..']
            }
        }
    },

    site: {
        url: 'https://cutkit-demo-production.up.railway.app/',
        name: 'CutKit',
    },

    app: {
        // ... (keep head configuration as is)
    },

    nitro: {
        compressPublicAssets: true,
        routeRules: {
            // ... (keep routeRules as is)
        },
    },

    experimental: {
        payloadExtraction: false,
    },

    build: {
        extractCSS: true,
    },
})
