import { defineConfig } from 'vitest/config';
import path from 'path';
import vue from '@vitejs/plugin-vue';

const portableAliases = {
  '#shared': path.resolve(__dirname, './shared'),
  '#utils': path.resolve(__dirname, './utils'),
  '#workers': path.resolve(__dirname, './workers'),
  '#services': path.resolve(__dirname, './server'),
  // Deep app graphs (an editor mount reaching the screen host) cross
  // Nuxt's #app; the SSR smoke harness stubs the same specifier.
  '#app': path.resolve(__dirname, './test-tools/nuxt-app-stubs.mjs')
};

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: true,
    // Nested agent-session worktrees contain stale duplicate specs that
    // otherwise match path filters and fail runs (the same tree the Nuxt
    // dev watcher ignores). The first five entries are vitest's defaults,
    // restated because setting `exclude` replaces them.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/.agent-worktrees/**',
      '**/.agent-wt*/**',
      '**/e2e/**',
      // Playwright owns the real-browser runtime smoke; Vitest must not collect it.
      '**/workers/documents/runtime-browser.spec.js'
    ],
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...portableAliases
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...portableAliases
    }
  }
});
