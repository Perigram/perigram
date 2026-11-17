import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRuntimeAssetFiles } from './plugin-runtime-assets.js';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

describe('managed plugin runtime asset collection', () => {
  it('collects the runtime entry and its transitive relative imports', () => {
    root = mkdtempSync(join(tmpdir(), 'perigram-runtime-assets-'));
    mkdirSync(join(root, 'runtime'), { recursive: true });
    writeFileSync(join(root, 'runtime/server.mjs'), "import { helper } from '../lib/helper.js';\nexport { helper };\n");
    mkdirSync(join(root, 'lib'));
    writeFileSync(join(root, 'lib/helper.js'), "export const helper = true;\n");
    const assets = collectRuntimeAssetFiles(root, '/runtime/server.mjs');
    expect(assets.map(asset => asset.path)).toEqual(['lib/helper.js', 'runtime/server.mjs']);
    expect(assets.every(asset => asset.buffer.length > 0)).toBe(true);
    expect(assets.find(asset => asset.path === 'runtime/server.mjs').contentType).toBe('text/javascript');
  });

  it('collects static assets resolved relative to import.meta.url', () => {
    root = mkdtempSync(join(tmpdir(), 'perigram-runtime-assets-'));
    mkdirSync(join(root, 'runtime'), { recursive: true });
    writeFileSync(join(root, 'runtime/server.mjs'), "import './engine.js';\n");
    writeFileSync(join(root, 'runtime/engine.js'), "export const wasm = new URL('./engine.wasm', import.meta.url);\n");
    writeFileSync(join(root, 'runtime/engine.wasm'), Buffer.from([0, 97, 115, 109]));
    const assets = collectRuntimeAssetFiles(root, '/runtime/server.mjs');
    expect(assets.map(asset => asset.path)).toEqual([
      'runtime/engine.js',
      'runtime/engine.wasm',
      'runtime/server.mjs'
    ]);
    expect(assets.find(asset => asset.path === 'runtime/engine.wasm').contentType).toBe('application/wasm');
  });

  it('collects the Facade browser runtime and its transitive Clipper WASM asset', () => {
    const packageRoot = fileURLToPath(new URL('../../../workers/facade', import.meta.url));
    const assets = collectRuntimeAssetFiles(packageRoot, '/runtime/server.mjs');
    const paths = new Set(assets.map(asset => asset.path));
    expect(paths.has('runtime/server.mjs')).toBe(true);
    expect(paths.has('assets/vendor/clipper2/clipper2z.js')).toBe(true);
    expect(paths.has('assets/vendor/clipper2/clipper2z.wasm')).toBe(true);
  });

  it('refuses runtime entry paths that escape the plugin package', () => {
    root = mkdtempSync(join(tmpdir(), 'perigram-runtime-assets-'));
    expect(() => collectRuntimeAssetFiles(root, '/../outside.mjs')).toThrow(/escapes plugin package/);
  });
});
