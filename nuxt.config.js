import { schemaWebSite } from './utils/schema'
import Re_L from './assets/presets/re_l'
import { fileURLToPath } from 'node:url'

const resolveRoot = (path) => fileURLToPath(new URL(path, import.meta.url))
const devHmrHost = process.env.NUXT_DEV_HMR_HOST || undefined
const devHmrProtocol = process.env.NUXT_DEV_HMR_PROTOCOL || 'ws'
const devHmrClientPort = Number(process.env.NUXT_DEV_HMR_CLIENT_PORT || 3000)
const cutkitAliases = {
    '@cutkit/core': resolveRoot('./packages/core/src/index.js'),
    '@cutkit/workflows': resolveRoot('./packages/workflows/src/index.js'),
    '@cutkit/mongo': resolveRoot('./packages/mongo/src/index.js'),
    '@cutkit/nitro': resolveRoot('./packages/nitro/src/index.js'),
    '@cutkit/vue': resolveRoot('./packages/vue/src/index.js'),
    '@cutkit/devtools': resolveRoot('./packages/devtools/src/index.js'),
    '@cutkit/mcp': resolveRoot('./packages/mcp/src/index.js'),
    '@cutkit/processes': resolveRoot('./packages/processes/src/index.js'),
    '@cutkit/domain-cnc': resolveRoot('./packages/domain-cnc/src/index.js')
}
const portableAliases = {
    '#shared': resolveRoot('./shared'),
    '#packages': resolveRoot('./packages'),
    '#utils': resolveRoot('./utils')
}

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',

    // Nitro's development error renderer can recurse through a corrupted
    // generated map and leave Vite proxy requests waiting until they 502.
    sourcemap: {
        server: false
    },

    alias: {
        ...cutkitAliases,
        ...portableAliases
    },

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
        billing: {
            priceCatalog: process.env.NUXT_BILLING_PRICE_CATALOG || '[]',
        },
        resendToken: process.env.RESEND_TOKEN || '',
        public: {
            baseUrl: process.env.BASE_URL || 'http://localhost:3000',
            gitCommitSha: process.env.GIT_COMMIT_SHA || '',
        },
    },

    vite: {
        resolve: {
            alias: {
                ...cutkitAliases,
                ...portableAliases
            }
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
                '@vue-flow/core',
                'three',
                'three/examples/jsm/controls/OrbitControls.js'
            ],
            exclude: ['nodi-modular']
        },
        server: {
            host: '0.0.0.0',
            strictPort: true,
            hmr: {
                protocol: devHmrProtocol,
                host: devHmrHost,
                clientPort: devHmrClientPort,
                path: '/_nuxt/'
            },
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
        head: {
            htmlAttrs: {
                lang: 'ru'
            },
            title: 'CutKit - CNC Manufacturing Platform',
            meta: [
                { charset: 'utf-8' },
                {
                    name: 'viewport',
                    content: 'width=device-width, initial-scale=1'
                },
                {
                    hid: 'description',
                    name: 'description',
                    content: 'CutKit manages CNC cassette templates, nesting runs, material inventory, generated artifacts, and production lifecycle tracking.'
                },
                {
                    hid: 'keywords',
                    name: 'keywords',
                    content: 'CutKit, CNC, nesting, cassette templates, manufacturing, material inventory'
                },
                {
                    hid: 'robots',
                    name: 'robots',
                    content: 'index, follow'
                },
                {
                    hid: 'author',
                    name: 'author',
                    content: 'CutKit'
                }
            ],
            link: [
                {
                    rel: 'apple-touch-icon',
                    sizes: '180x180',
                    href: '/favicon/apple-touch-icon.png'
                },
                {
                    rel: 'icon',
                    type: 'image/png',
                    sizes: '32x32',
                    href: '/favicon/favicon-32x32.png'
                },
                {
                    rel: 'icon',
                    type: 'image/png',
                    sizes: '16x16',
                    href: '/favicon/favicon-16x16.png'
                },
                {
                    rel: 'icon',
                    type: 'image/x-icon',
                    href: '/favicon/favicon.ico'
                }
            ],
            script: [
                {
                    async: true,
                    type: 'application/ld+json',
                    children: JSON.stringify(schemaWebSite)
                }
            ]
        }
    },

    nitro: {
        compressPublicAssets: true,
        alias: {
            ...cutkitAliases,
            ...portableAliases
        },
        routeRules: {
            '/icons/**': {
                headers: {
                    'cache-control': 'public,max-age=31536000,s-maxage=31536000,immutable'
                }
            },
            '/fonts/**': {
                headers: {
                    'cache-control': 'public,max-age=31536000,s-maxage=31536000,immutable'
                }
            },
            '/_nuxt/**': {
                headers: {
                    'cache-control': 'public,max-age=31536000,immutable'
                }
            },
            '/**': {
                headers: {
                    'cache-control': 'public,max-age=0,s-maxage=86400,stale-while-revalidate'
                }
            }
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
