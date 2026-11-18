import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(new URL('.', import.meta.url).pathname);
const entry = resolve(root, 'runtime/shared.mjs');

export async function buildDocumentsRuntime() {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      target: 'es2022',
      minify: false,
      sourcemap: false,
      emptyOutDir: false,
      outDir: resolve(root, 'runtime'),
      lib: { entry, formats: ['es'], fileName: () => 'shared.bundle.mjs' },
      rollupOptions: {
        output: { inlineDynamicImports: true, entryFileNames: 'shared.bundle.mjs' }
      }
    }
  });
  console.log('Built browser/server Documents runtime: runtime/shared.bundle.mjs');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDocumentsRuntime();
}
