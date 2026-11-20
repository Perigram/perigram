import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const entry = resolve(root, 'runtime/geometry-base.mjs');

export async function buildGeometryBaseRuntime() {
  const output = resolve(root, 'runtime/geometry-base-bundle.mjs');
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
        lib: { entry, formats: ['es'], fileName: () => 'geometry-base-bundle.mjs' },
        rollupOptions: {
          external: [],
          output: { inlineDynamicImports: true, entryFileNames: 'geometry-base-bundle.mjs' }
        }
      }
    });
    const built = resolve(temporary, 'geometry-base-bundle.mjs');
    const bundle = readFileSync(built, 'utf8');
    const bareImports = [
      ...bundle.matchAll(/^[ \t]*import[^\n]*?from[ \t]*['"]([^'"\n]+)['"][ \t]*;?[ \t]*$/gm),
      ...bundle.matchAll(/^[ \t]*import[ \t]*['"]([^'"\n]+)['"][ \t]*;?[ \t]*$/gm),
      ...bundle.matchAll(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g)
    ].map(match => match[1])
      .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(specifier));
    if (bareImports.length) {
      throw new Error('Geometry base browser runtime contains unresolved bare imports: ' + [...new Set(bareImports)].join(', '));
    }
    renameSync(built, output);
    console.log('Built self-contained browser/server Geometry base runtime: runtime/geometry-base-bundle.mjs');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildGeometryBaseRuntime();
}
