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
    './utils/*.js',
  ],
  darkMode: ['selector', '.dark-mode'],
  theme: {
    extend: tailwindThemeExtension,
  },
  plugins: [({ addUtilities }) => addUtilities(typographyRoles)],
};
