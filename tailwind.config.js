import { designTokens, tailwindThemeExtension } from './assets/tokens/index.js';

const typographyRoles = Object.fromEntries(Object.entries(designTokens.typography.roles).map(([role, properties]) => [
  `.text-${role}`,
  {
    ...properties,
    fontFamily: designTokens.typography[properties.fontFamily],
  },
]));

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}',
    './assets/css/**/*.css',
    './shared/ui-mapping/*.js',
    // Shared root modules carry utility class recipes (the markdown
    // element recipe); unscanned, those classes never compile.
    './shared/*.js',
    './utils/*.js',
    // In-repo plugin surface modules compose with the host's utility
    // classes; without this scan those classes never compile and the
    // surfaces render unstyled. Vendored runtimes are excluded — they
    // never carry host classes and would only bloat the extraction.
    './workers/facade/surfaces/**/*.{js,mjs}',
    // Pack editor surfaces (packages/<pack>/src/editors) compose with
    // the host's utility classes exactly like plugin surface modules —
    // without this scan their classes never compile and the surfaces
    // render broken (the split editor's responsive panes stayed hidden).
    './packages/*/src/editors/**/*.{vue,js}',
  ],
  darkMode: ['selector', '.dark-mode'],
  theme: {
    extend: tailwindThemeExtension,
  },
  plugins: [({ addUtilities }) => addUtilities(typographyRoles)],
};
