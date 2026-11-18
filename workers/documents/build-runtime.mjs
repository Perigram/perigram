import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const entry = resolve(root, 'runtime/shared.mjs');

export async function buildDocumentsRuntime() {
  const output = resolve(root, 'runtime/shared-bundle.mjs');
  const temporary = mkdtempSync(join(resolve(root, 'runtime'), '.build-'));
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'warn',
      build: {
        target: 'es2022',
        minify: false,
        sourcemap: false,
        emptyOutDir: true,
        outDir: temporary,
        lib: { entry, formats: ['es'], fileName: () => 'shared-bundle.mjs' },
        rollupOptions: {
          // Browser Workers have no Node resolver or import map. Bundle every
          // dependency, especially marked, into this single portable asset.
          external: [],
          output: { inlineDynamicImports: true, entryFileNames: 'shared-bundle.mjs' }
        }
      }
    });
    const built = resolve(temporary, 'shared-bundle.mjs');
    const bundle = readFileSync(built, 'utf8');
    const bareImports = [
      ...bundle.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...bundle.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...bundle.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(match => match[1])
      .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(specifier));
    if (bareImports.length) {
      throw new Error('Documents browser runtime contains unresolved bare imports: ' + [...new Set(bareImports)].join(', '));
    }
    // Atomic replacement means concurrent test/seed builds never expose a
    // partially written runtime asset to the package collector.
    renameSync(built, output);
    console.log('Built self-contained browser/server Documents runtime: runtime/shared-bundle.mjs');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDocumentsRuntime();
}
