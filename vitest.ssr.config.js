// Page SSR smoke config: mounts real page SFCs through vue/server-renderer
// with Nuxt auto-import globals stubbed, so template bindings that the
// script-only checks cannot see (missing setup bindings, undefined computed
// reads in never-tested tabs) fail here instead of as a runtime 500.
// Run: npx vitest run --config vitest.ssr.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';
import vue from '@vitejs/plugin-vue';

const repo = (p) => path.resolve(__dirname, p);
const stubs = repo('./test-tools/nuxt-app-stubs.mjs');

const portableAliases = {
  '#shared': repo('./shared'),
  '#packages': repo('./packages'),
  '#utils': repo('./utils'),
  '#workers': repo('./workers')
};

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: true,
    include: ['test-tools/*.ssr-smoke.js'],
    alias: {
      '~': repo('./'),
      '@': repo('./'),
      '#app': stubs,
      '#imports': stubs,
      ...portableAliases
    }
  }
});
