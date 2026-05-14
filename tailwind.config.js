import { tailwindThemeExtension } from './assets/tokens/index.js';

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}',
    './assets/css/**/*.css',
  ],
  darkMode: ['selector', '.dark-mode'],
  theme: {
    extend: tailwindThemeExtension,
  },
  plugins: [],
};
