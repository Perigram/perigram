// The cad-occt vendor build (workers/cad-occt/README.md owns the law):
// stages the occt-wasm kernel binary into the vendor scope and rewrites
// the emscripten loader's default `new URL("occt-wasm.wasm",
// import.meta.url)` — left pointing at the chunk directory by the bundle
// split — at the binary's staged location, so the release walker's
// asset scan resolves it. The runtime passes the binary explicitly; the
// rewritten default keeps the loader honest if it ever runs. Module
// bundles build with `perigram-plugin vendor --entry runtime`.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const vendorDir = resolve(root, 'assets/vendor');
const chunksDir = join(vendorDir, 'chunks');

mkdirSync(vendorDir, { recursive: true });
copyFileSync(
  resolve(root, 'node_modules/occt-wasm/dist/occt-wasm.wasm'),
  join(vendorDir, 'occt-wasm.wasm')
);

let rewrote = 0;
for (const name of readdirSync(chunksDir, { withFileTypes: true })) {
  if (!name.isFile() || !name.name.endsWith('.mjs')) continue;
  const path = join(chunksDir, name.name);
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
console.log(`Staged cad-occt vendor asset: assets/vendor/occt-wasm.wasm (loader default rewritten in ${rewrote} chunk${rewrote === 1 ? '' : 's'})`);
