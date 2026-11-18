import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const entry = resolve(root, 'runtime/shared.mjs');

export async function buildDocumentsRuntime() {
  await build({
    root,
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
        // This is a browser-carried runtime, not an npm package. In
        // particular, `marked` must be included in the bundle: a module
        // Worker has no Node resolver or import map for bare specifiers.
        external: [],
        output: { inlineDynamicImports: true, entryFileNames: 'shared.bundle.mjs' }
      }
    }
  });
  const bundle = readFileSync(resolve(root, 'runtime/shared.bundle.mjs'), 'utf8');
  const bareImports = [...bundle.matchAll(/(?:\\bfrom\\s*|\\bimport\\s*(?:\\(\\s*)?)['\"]([^'\"]+)['\"]/g)]
    .map(match => match[1])
    .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(specifier));
  if (bareImports.length) {
    throw new Error(`Documents browser runtime contains unresolved bare imports: ${[...new Set(bareImports)].join(', ')}`);
  }
  console.log('Built self-contained browser/server Documents runtime: runtime/shared.bundle.mjs');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDocumentsRuntime();
}
