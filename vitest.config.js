import { defineConfig } from 'vitest/config';
import path from 'path';
import vue from '@vitejs/plugin-vue';

const perigramAliases = {
  '@perigram/core': path.resolve(__dirname, './packages/core/src/index.js'),
  '@perigram/workflows': path.resolve(__dirname, './packages/workflows/src/index.js'),
  '@perigram/mongo': path.resolve(__dirname, './packages/mongo/src/index.js'),
  '@perigram/nitro': path.resolve(__dirname, './packages/nitro/src/index.js'),
  '@perigram/vue': path.resolve(__dirname, './packages/vue/src/index.js'),
  '@perigram/devtools': path.resolve(__dirname, './packages/devtools/src/index.js'),
  '@perigram/mcp': path.resolve(__dirname, './packages/mcp/src/index.js'),
  '@perigram/facade': path.resolve(__dirname, './packages/facade/src/index.js')
};
const portableAliases = {
  '#shared': path.resolve(__dirname, './shared'),
  '#packages': path.resolve(__dirname, './packages'),
  '#utils': path.resolve(__dirname, './utils'),
  '#services': path.resolve(__dirname, './server')
};

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: true,
    // Nested agent-session worktrees contain stale duplicate specs that
    // otherwise match path filters and fail runs (the same tree the Nuxt
    // dev watcher ignores); run-repository.spec.js is a node:test file
    // with its own `npm run test:durable` runner, not a vitest suite.
    // The first five entries are vitest's defaults, restated because
    // setting `exclude` replaces them.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/.agent-worktrees/**',
      '**/.agent-wt*/**',
      'server/features/process-definitions/run-repository.spec.js'
    ],
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...perigramAliases,
      ...portableAliases
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...perigramAliases,
      ...portableAliases
    }
  }
});
