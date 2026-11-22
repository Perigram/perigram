import { schemaWebSite } from './utils/schema'
import Re_L from './assets/presets/re_l'
import { cssVariableTokens, darkCssVariableTokens, primeFormFluidPT, primeTabsStripPT } from './assets/tokens/index.js'
import { fileURLToPath } from 'node:url'

const resolveRoot = (path) => fileURLToPath(new URL(path, import.meta.url))
const devHmrHost = process.env.NUXT_DEV_HMR_HOST || undefined
const devHmrProtocol = process.env.NUXT_DEV_HMR_PROTOCOL || 'ws'
const devHmrClientPort = Number(process.env.NUXT_DEV_HMR_CLIENT_PORT || 3000)
const portableAliases = {
    '#shared': resolveRoot('./shared'),
    '#utils': resolveRoot('./utils'),
    '#workers': resolveRoot('./workers')
}
const cssDeclarations = tokens => Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(';')
const appTokenStyles = `:root{${cssDeclarations(cssVariableTokens)}}.dark-mode{${cssDeclarations(darkCssVariableTokens)}}`

// Watch-ignore predicate for dev-foreign trees — agent worktrees and
// scratch and `.opencode` tooling state: chokidar
// v4 leaks glob-ignored nested events, so the ignore must match paths,
// not globs. Contract: Development notes in the root README.
const DEV_WATCH_IGNORE = p => /(^|[\\/])(\.agent([-_]w[a-z0-9_-]*)?|\.opencode)([\\/]|$)/i.test(String(p));

export default defineNuxtConfig({
    ignore: ['**/.agent/**', '**/.agent-worktrees/**', '**/.agent-wt*/**', '**/.opencode/**'],
    compatibilityDate: '2025-07-15',

    // Home serves at the stable shell route '/home' — the canonical
    // screen-contract constant. The screens route's param is rewritten to
    // a true optional param first: vue-router only accepts a static alias
    // onto a parametrized record when the param is optional, and the
    // built client router DROPS the record's layout/meta on the invalid
    // combination — SSR rendered the app shell while the hydrated client
    // rendered a bare stuck-loading page (2026-09-30 staging "broken
    // layouts" incident). The screens renderer's documented fallback
    // resolves an absent key to the home screen, so '/home' and
    // '/screens/<key>' both serve the renderer without a duplicated page.
    hooks: {
        'pages:extend'(pages) {
            const screensPage = pages.find(page => String(page.path || '').startsWith('/screens/'));
            if (screensPage) {
                screensPage.path = '/screens/:screenKey?';
                screensPage.alias = ['/home'];
            }
        }
    },

    alias: {
        ...portableAliases
    },

    // Dev-memory: the Vite worker isolate holds ~1.4GB of transform caches.
    // inspect plugin (via devtools) copies every transform; sourcemaps are
    // decoded+retained per module; inlineStyles re-processes component CSS
    // for SSR. All three are dead weight when nobody is debugging.
    devtools: { enabled: false },
    sourcemap: { client: false, server: false },
    features: { inlineStyles: false },


    modules: ['@nuxtjs/i18n', '@primevue/nuxt-module', '@nuxtjs/tailwindcss', '@pinia/nuxt'],

    imports: {
        dirs: ['stores']
    },

    primevue: {
        options: {
            ripple: true,
            // Form fields fill their host by default — see the fluid pt
            // contract in assets/tokens/README.md.
            pt: { ...primeFormFluidPT, ...primeTabsStripPT },
            theme: {
                preset: Re_L,
                options: {
                    darkModeSelector: '.dark-mode',
                    // All PrimeVue style blocks emit into the `primevue`
                    // cascade layer. Unlayered CSS (Tailwind utilities, app
                    // css) then beats them in EVERY build — without this,
                    // the production bundle inlines PrimeVue styles after
                    // the app CSS and every equal-specificity tie
                    // (utilities on p-* elements) flips against the app.
                    cssLayer: {
                        name: 'primevue',
                        order: 'tailwind-base, primevue, tailwind-utilities'
                    }
                },
            },
        },
    },

    // The Tailwind module's own CSS template injection is off: main.css is
    // the single emission point (its @tailwind directives are layer-wrapped
    // in the same declared order as the PrimeVue layer above). With both
    // active the built document carried two full Tailwind blocks whose
    // position against PrimeVue's inline blocks decided the cascade.
    tailwindcss: {
        cssPath: false
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
            mode: process.env.NUXT_BILLING_MODE || 'prepaidTokens',
            currentTariff: process.env.NUXT_BILLING_CURRENT_TARIFF || '',
            currentTariffLabelKey: process.env.NUXT_BILLING_CURRENT_TARIFF_LABEL_KEY || '',
        },
        resendToken: process.env.RESEND_TOKEN || '',
        vapidPublicKey: process.env.NUXT_VAPID_PUBLIC_KEY || '',
        vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY || '',
        public: {
            baseUrl: process.env.BASE_URL || 'http://localhost:3000',
            gitCommitSha: process.env.GIT_COMMIT_SHA || '',
        },
    },

    vite: {
        define: {
            // Prod hydration mismatches print full detail (element, server
            // vs client value, component chain) instead of the one-liner —
            // the diagnostic switch for layout-vs-SSR bugs on staging.
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true'
        },
        resolve: {
            alias: {
                ...portableAliases
            }
        },
        ssr: {},
        server: {
            watch: {
                ignored: [DEV_WATCH_IGNORE]
            }
        },
        // Dev-only: a user-level `environments` object deroutes the
        // vite 7 SSR build in production. Root README, Development.
        ...(process.env.NODE_ENV === 'development' ? {
            environments: {
                client: { dev: { watch: { ignored: [DEV_WATCH_IGNORE] } } },
                ssr: {
                    dev: { watch: { ignored: [DEV_WATCH_IGNORE] } }
                }
            }
        } : {}),
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
                'primevue/togglebutton',
                'primevue/speeddial',
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
        url: 'https://perigram-demo-production.up.railway.app/',
        name: 'Perigram',
    },

    app: {
        head: {
            htmlAttrs: {
                lang: 'ru'
            },
            title: 'Perigram — Program the work. Compile the app.',
            style: [{ textContent: appTokenStyles }],
            meta: [
                { charset: 'utf-8' },
                {
                    name: 'viewport',
                    // The app is a PWA-style shell with its own canvas gesture
                    // handling: pinch/double-tap page zoom stays disabled so
                    // touch gestures never scale the shell. Firefox ignores
                    // user-scalable, so assets/css/main.css also pins html
                    // touch-action to panning only. interactive-widget
                    // resizes the layout viewport with the soft keyboard, so
                    // full-height chat surfaces keep the composer visible
                    // while typing.
                    content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content'
                },
                {
                    hid: 'theme-color',
                    name: 'theme-color',
                    content: '#09090b'
                },
                {
                    hid: 'theme-color-light',
                    name: 'theme-color',
                    media: '(prefers-color-scheme: light)',
                    content: '#f4f4f5'
                },
                {
                    hid: 'description',
                    name: 'description',
                    content: 'Perigram compiles typed process declarations into a running application: workflows, screens, and access generated from what your organization authors.'
                },
                {
                    hid: 'keywords',
                    name: 'keywords',
                    content: 'Perigram, process programming, process compiler, declarative applications, type system, generated UI'
                },
                {
                    hid: 'robots',
                    name: 'robots',
                    content: 'index, follow'
                },
                {
                    hid: 'author',
                    name: 'author',
                    content: 'Perigram'
                }
            ],
            link: [
                {
                    rel: 'manifest',
                    href: '/manifest.webmanifest'
                },
                {
                    rel: 'icon',
                    type: 'image/svg+xml',
                    href: '/icon.svg'
                },
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
        watchOptions: {
            ignored: [DEV_WATCH_IGNORE]
        },
        alias: {
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
                    'cache-control': 'public,max-age=0'
                }
            }
        },
    },

    experimental: {
        payloadExtraction: false,
        // Enables hydrate-on-* strategy props on Lazy components; opt-in per surface.
        lazyHydration: true,
    },

    build: {
        extractCSS: true,
        transpile: ['@vue-flow/core']
    },
})
