// Global stylesheets enter the client graph through a universal plugin:
// with Nuxt 3.19's vite builder, `css:` array entries land only in the SSR
// entry-styles sidecar, so the browser never receives them (scoped
// component styles are unaffected). A plugin module is part of both build
// environments, which restores the client emission. Order matches the old
// css array: icons, fonts, then the tailwind-carrying main sheet.
import 'primeicons/primeicons.css';
import '~/assets/css/fonts.css';
import '~/assets/css/main.css';

export default defineNuxtPlugin(() => {});
