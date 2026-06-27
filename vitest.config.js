import { defineConfig } from 'vitest/config';
import path from 'path';
import vue from '@vitejs/plugin-vue';

const cutkitAliases = {
  '@cutkit/core': path.resolve(__dirname, './packages/core/src/index.js'),
  '@cutkit/workflows': path.resolve(__dirname, './packages/workflows/src/index.js'),
  '@cutkit/mongo': path.resolve(__dirname, './packages/mongo/src/index.js'),
  '@cutkit/nitro': path.resolve(__dirname, './packages/nitro/src/index.js'),
  '@cutkit/vue': path.resolve(__dirname, './packages/vue/src/index.js'),
  '@cutkit/devtools': path.resolve(__dirname, './packages/devtools/src/index.js'),
  '@cutkit/mcp': path.resolve(__dirname, './packages/mcp/src/index.js'),
  '@cutkit/domain-cnc': path.resolve(__dirname, './packages/domain-cnc/src/index.js')
};
const portableAliases = {
  '#shared': path.resolve(__dirname, './shared'),
  '#packages': path.resolve(__dirname, './packages'),
  '#utils': path.resolve(__dirname, './utils')
};

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: true,
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...cutkitAliases,
      ...portableAliases
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './'),
      ...cutkitAliases,
      ...portableAliases
    }
  }
});
