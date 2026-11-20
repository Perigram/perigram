// The cad-occt vendor build (workers/cad-occt/README.md owns the law):
// builds the SDK derivation module into the vendor scope (resolved within
// this checkout, so an agent worktree vendors its own package sources —
// the runtime imports it by relative path, the documents shared-bundle
// pattern), stages the occt-wasm kernel binary beside the vendor modules,
// and rewrites the emscripten loader's default `new URL("occt-wasm.wasm",
// import.meta.url)` — left pointing at the chunk directory by the bundle
// split — at the binary's staged location so the release walker's asset
// scan resolves it. The runtime passes the binary explicitly; the
// rewritten default keeps the loader honest if it ever runs. The brepjs
// and occt-wasm module bundles build with
// `perigram-plugin vendor --entry runtime`.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const vendorDir = resolve(root, 'assets/vendor');
const chunksDir = join(vendorDir, 'chunks');

const require = createRequire(resolve(root, 'package.json'));
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  throw new Error('vendoring needs esbuild in the plugin repo — npm install -D esbuild at the repo root (the SDK itself stays zero-dependency)');
}

mkdirSync(vendorDir, { recursive: true });

await esbuild.build({
  entryPoints: { 'perigram-plugin-sdk-nodes': resolve(root, '../../packages/plugin-sdk/src/node-contract.js') },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  absWorkingDir: root,
  outdir: vendorDir,
  entryNames: '[name]',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning'
});

copyFileSync(
  resolve(root, 'node_modules/occt-wasm/dist/occt-wasm.wasm'),
  join(vendorDir, 'occt-wasm.wasm')
);

let rewrote = 0;
for (const entry of readdirSync(chunksDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
  const path = join(chunksDir, entry.name);
  const source = readFileSync(path, 'utf8');
  const patched = source.replaceAll(
    'new URL("occt-wasm.wasm", import.meta.url)',
    'new URL("../occt-wasm.wasm", import.meta.url)'
  );
  if (patched !== source) {
    writeFileSync(path, patched);
    rewrote += 1;
  }
}
console.log(`Built cad-occt vendor assets: assets/vendor/perigram-plugin-sdk-nodes.mjs, occt-wasm.wasm (loader default rewritten in ${rewrote} chunk${rewrote === 1 ? '' : 's'})`);
