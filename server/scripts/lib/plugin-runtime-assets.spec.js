import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('refuses runtime entry paths that escape the plugin package', () => {
    root = mkdtempSync(join(tmpdir(), 'perigram-runtime-assets-'));
    expect(() => collectRuntimeAssetFiles(root, '/../outside.mjs')).toThrow(/escapes plugin package/);
  });
});
