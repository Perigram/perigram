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
    extend: {
      colors: {
        primary: 'var(--p-primary-color)',
        'primary-contrast': 'var(--p-primary-contrast-color)',
        'primary-emphasis': 'var(--p-primary-emphasis-color)',
        surface: {
          0: 'var(--p-surface-0)',
          50: 'var(--p-surface-50)',
          100: 'var(--p-surface-100)',
          200: 'var(--p-surface-200)',
          300: 'var(--p-surface-300)',
          400: 'var(--p-surface-400)',
          500: 'var(--p-surface-500)',
          600: 'var(--p-surface-600)',
          700: 'var(--p-surface-700)',
          800: 'var(--p-surface-800)',
          900: 'var(--p-surface-900)',
          950: 'var(--p-surface-950)',
        }
      }
    },
  },
  plugins: [],
};