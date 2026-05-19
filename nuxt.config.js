import { schemaWebSite } from './utils/schema'
import Re_L from './assets/presets/re_l'
import { fileURLToPath } from 'node:url'

const resolveRoot = (path) => fileURLToPath(new URL(path, import.meta.url))
const cutkitAliases = {
    '@cutkit/core': resolveRoot('./packages/core/src/index.js'),
    '@cutkit/workflows': resolveRoot('./packages/workflows/src/index.js'),
    '@cutkit/mongo': resolveRoot('./packages/mongo/src/index.js'),
    '@cutkit/nitro': resolveRoot('./packages/nitro/src/index.js'),
    '@cutkit/vue': resolveRoot('./packages/vue/src/index.js'),
    '@cutkit/devtools': resolveRoot('./packages/devtools/src/index.js'),
    '@cutkit/mcp': resolveRoot('./packages/mcp/src/index.js'),
    '@cutkit/domain-cnc': resolveRoot('./packages/domain-cnc/src/index.js')
}

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',

    alias: cutkitAliases,

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
        resolve: {
            alias: cutkitAliases
        },
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
                'primevue/inputchips',
                'primevue/accordion',
                'primevue/accordionpanel',
                'primevue/accordionheader',
                'primevue/accordioncontent',
                'primevue/popover',
                'primevue/drawer',
                'primevue/datepicker',
                'primevue/toggleswitch',
                'primevue/password',
                'primevue/tabs',
                'primevue/tablist',
                'primevue/tab',
                'primevue/tabpanels',
                'primevue/tabpanel',
                '@vue-flow/core'
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
        alias: cutkitAliases,
        routeRules: {
            // ... (keep routeRules as is)
        },
    },

    experimental: {
        payloadExtraction: false,
    },

    build: {
        extractCSS: true,
        transpile: ['@vue-flow/core']
    },
})
