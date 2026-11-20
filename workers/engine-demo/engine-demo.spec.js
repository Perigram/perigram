// The demo engine's focused proof (E3b engine bootstrap + E6 mesh
// channel): the listing validates through the SDK contract, the seed
// release collector stages the whole runtime (entry graph plus the
// declared staged assets), and the real worker bootstraps against a
// module-proxy-shaped HTTP server — checksum-pinned fetches, WASM
// instantiation, wheel import, dispatch, and the tessellated mesh
// contract the preview channel renders.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { parseListing, normalizeListing } from '../../packages/plugin-sdk/src/listing.js';
import { assertValidNodeDefinition } from '../../packages/plugin-sdk/src/node-contract.js';
import { prepareListingRelease } from '../../server/scripts/lib/plugin-runtime-assets.js';
import { evaluateExpression } from './engine/interpreter.mjs';
import { MAKE_MESH_NODE } from './engine/index.mjs';
import createMeshSurface, { sceneMeshesOf } from './surfaces/mesh-preview.mjs';
import { graphOutputViews } from '../../utils/graphOutputViews.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const listing = JSON.parse(readFileSync(join(packageRoot, 'listing.json'), 'utf8'));

describe('demo engine listing (E3b grammar)', () => {
  it('validates through the SDK contract with staged engine assets', () => {
    const layer = parseListing(listing);
    expect(layer.engine).toEqual({
      module: '/engine/index.mjs',
      assets: ['/runtime/manifest.json', '/runtime/kernel.wasm', '/runtime/ops-shapes.mjs']
    });
  });

  it('refuses malformed staged assets', () => {
    expect(() => parseListing({ ...listing, declarations: { ...listing.declarations, engine: { module: '/engine/index.mjs', assets: [] } } }))
      .toThrow(/engine assets must be a non-empty array/);
    expect(() => parseListing({ ...listing, declarations: { ...listing.declarations, engine: { module: '/engine/index.mjs', assets: ['runtime/kernel.wasm'] } } }))
      .toThrow(/root-relative package path/);
    expect(() => parseListing({ ...listing, declarations: { ...listing.declarations, engine: { module: '/engine/index.mjs', assets: ['/runtime/../etc/passwd'] } } }))
      .toThrow(/root-relative package path/);
    expect(() => parseListing({ ...listing, declarations: { ...listing.declarations, engine: { module: '/engine/index.mjs', assets: ['/engine/index.mjs'] } } }))
      .toThrow(/is the entry module/);
    expect(() => parseListing({ ...listing, declarations: { ...listing.declarations, engine: { module: '/engine/index.mjs', assets: ['/runtime/kernel.wasm', '/runtime/kernel.wasm'] } } }))
      .toThrow(/duplicate engine asset/);
  });

  it('stages the complete release: entry graph, declared runtime assets, and surfaces', () => {
    const paths = prepareListingRelease(normalizeListing(listing), packageRoot).map(asset => asset.path);
    expect(paths).toEqual([
      'engine/index.mjs',
      'engine/interpreter.mjs',
      'engine/worker.mjs',
      'runtime/kernel.wasm',
      'runtime/manifest.json',
      'runtime/ops-shapes.mjs',
      'surfaces/mesh-preview.mjs'
    ]);
  });

  it('carries a checksum-valid runtime manifest', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'runtime/manifest.json'), 'utf8'));
    for (const asset of manifest.assets) {
      const digest = `sha256:${createHash('sha256').update(readFileSync(join(packageRoot, asset.path.slice(1)))).digest('hex')}`;
      expect(digest).toBe(asset.sha256);
    }
  });
});

describe('demo engine interpreter', () => {
  it('evaluates arithmetic expressions with constants and functions', () => {
    expect(evaluateExpression('2')).toBe(2);
    expect(evaluateExpression('0.5 + 0.25 * sin(8)')).toBeCloseTo(0.5 + 0.25 * Math.sin(8), 12);
    expect(evaluateExpression('(1 + 1) * 3')).toBe(6);
    expect(evaluateExpression('-2^2')).toBe(-4);
    expect(evaluateExpression('tau / pi')).toBeCloseTo(2, 12);
    expect(evaluateExpression('max(1, min(3, 2))')).toBe(2);
    expect(evaluateExpression('sqrt(2)^2')).toBeCloseTo(2, 12);
  });

  it('refuses malformed expressions', () => {
    expect(() => evaluateExpression('')).toThrow(/empty/);
    expect(() => evaluateExpression('1 +')).toThrow(/dangling/);
    expect(() => evaluateExpression('unknown + 1')).toThrow(/unknown name/);
    expect(() => evaluateExpression('(1')).toThrow(/unbalanced/);
    expect(() => evaluateExpression('1; drop table')).toThrow(/unexpected character/);
  });
});

// A module-proxy-shaped server: package paths with ETag revalidation —
// the response contract the platform's module proxy serves.
function startProxyServer() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    let body;
    try {
      body = readFileSync(join(packageRoot, path));
    } catch {
      response.writeHead(404).end();
      return;
    }
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, { etag }).end();
      return;
    }
    response.writeHead(200, {
      etag,
      'content-type': path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'
    }).end(body);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, address: server.address() })));
}

// Node's worker_threads lack the browser worker globals; the shim
// forwards parentPort messages onto the same self.onmessage contract
// the browser worker speaks, then loads the real worker module.
function writeWorkerShim(directory) {
  const shim = `
const { parentPort } = await import('node:worker_threads');
globalThis.self = {
  postMessage: message => parentPort.postMessage(message),
  onmessage: null
};
parentPort.on('message', message => self.onmessage?.({ data: message }));
await import(${JSON.stringify(pathToFileURL(join(packageRoot, 'engine/worker.mjs')).href)});
`;
  const shimPath = join(directory, 'worker-shim.mjs');
  writeFileSync(shimPath, shim);
  return shimPath;
}

function callWorker(worker, message) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      worker.off('message', onMessage);
      reject(error);
    };
    const onMessage = data => {
      worker.off('error', onError);
      resolve(data);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(message);
    setTimeout(() => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      reject(new Error('Worker call timed out'));
    }, 10000).unref?.();
  });
}

describe('demo engine worker bootstrap (E3b)', () => {
  let proxy;
  let scratch;
  let shimPath;

  beforeAll(async () => {
    proxy = await startProxyServer();
    scratch = mkdtempSync(join(tmpdir(), 'engine-demo-'));
    shimPath = writeWorkerShim(scratch);
  });

  afterAll(async () => {
    await new Promise(resolve => proxy.server.close(resolve));
    rmSync(scratch, { recursive: true, force: true });
  });

  function spawnWorker() {
    return new Worker(shimPath, { execArgv: [] });
  }

  it('bootstraps the staged runtime through the proxy and dispatches a tessellated mesh', async () => {
    const worker = spawnWorker();
    try {
      const baseUrl = `http://127.0.0.1:${proxy.address.port}/engine/`;
      const ready = await callWorker(worker, { type: 'bootstrap', baseUrl });
      expect(ready.type).toBe('ready');
      expect(ready.provenance.fetched).toEqual([
        expect.stringContaining('/runtime/kernel.wasm'),
        expect.stringContaining('/runtime/ops-shapes.mjs')
      ]);
      expect(ready.provenance.cached).toEqual([]);

      const result = await callWorker(worker, {
        type: 'dispatch',
        callId: 'call-1',
        service: 'make-mesh',
        parameters: { ring: '2', tube: '0.5', major: 8, minor: 6 }
      });
      const mesh = result.value;
      expect(mesh.representation).toBe('perigram.scene-3d');
      expect(mesh.vertices).toHaveLength(8 * 6);
      expect(mesh.normals).toHaveLength(8 * 6);
      expect(mesh.faces).toHaveLength(8 * 6 * 2);
      expect(mesh.vertices[0]).toEqual([2.5, 0, 0]);
      expect(mesh.normals[0]).toEqual([1, 0, 0]);
      for (const vertex of mesh.vertices) {
        for (const coordinate of vertex) {
          expect(Number.isFinite(coordinate)).toBe(true);
        }
      }
      for (const face of mesh.faces) {
        expect(face).toHaveLength(3);
        for (const index of face) {
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(mesh.vertices.length);
        }
      }
      // The mesh value is structured-cloneable plain data: it already
      // crossed one worker boundary to reach this test.
      expect(() => JSON.parse(JSON.stringify(mesh))).not.toThrow();
    } finally {
      await worker.terminate();
    }
  });

  it('refuses a runtime asset that fails its pinned checksum', async () => {
    const tampering = createServer((request, response) => {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (path.endsWith('manifest.json')) {
        response.writeHead(200, { 'content-type': 'application/json' })
          .end(readFileSync(join(packageRoot, 'runtime/manifest.json')));
        return;
      }
      if (path.includes('kernel.wasm')) {
        const bytes = readFileSync(join(packageRoot, 'runtime/kernel.wasm'));
        bytes[bytes.length - 1] ^= 0xff;
        response.writeHead(200, { 'content-type': 'application/wasm' }).end(bytes);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise(resolve => tampering.listen(0, '127.0.0.1', resolve));
    const worker = spawnWorker();
    try {
      const failure = await callWorker(worker, {
        type: 'bootstrap',
        baseUrl: `http://127.0.0.1:${tampering.address().port}/engine/`
      });
      expect(failure.type).toBe('bootstrap-error');
      expect(failure.error.message).toMatch(/pinned checksum/);
    } finally {
      await worker.terminate();
      await new Promise(resolve => tampering.close(resolve));
    }
  });

  it('serves the staged kernel byte-exact with ETag revalidation', async () => {
    const kernel = readFileSync(join(packageRoot, 'runtime/kernel.wasm'));
    const first = await fetch(`http://127.0.0.1:${proxy.address.port}/runtime/kernel.wasm`);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/wasm');
    expect(Buffer.from(await first.arrayBuffer()).equals(kernel)).toBe(true);
    const revalidated = await fetch(`http://127.0.0.1:${proxy.address.port}/runtime/kernel.wasm`, {
      headers: { 'if-none-match': first.headers.get('etag') }
    });
    expect(revalidated.status).toBe(304);
  });
});

describe('demo engine node contribution (E6 channel source)', () => {
  it('declares a valid browser-executable node definition', () => {
    expect(MAKE_MESH_NODE.provider).toBe('plugin.engine-demo');
    expect(() => assertValidNodeDefinition(MAKE_MESH_NODE)).not.toThrow();
    expect(graphOutputViews({ representation: 'perigram.scene-3d', vertices: [[0, 0, 0]], faces: [[0, 0, 0]] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ value: 'scene-3d' })]));
  });
});

describe('demo engine mesh preview surface (E6)', () => {
  const vue = { h: (tag, props, children) => ({ tag, props, children }) };
  const mesh = {
    representation: 'perigram.scene-3d',
    vertices: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]],
    faces: [[0, 1, 2], [1, 3, 2]],
    normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]
  };

  it('renders scene values from every payload position as an SVG projection', () => {
    const surface = createMeshSurface({ vue });
    const render = () => surface.render.call({ payload: { nodeOutputs: { nodeA: { shape: mesh } } } });
    const tree = render();
    expect(tree.tag).toBe('div');
    const svg = tree.children[0];
    expect(svg.tag).toBe('svg');
    const polygons = svg.children.filter(node => node.tag === 'polygon');
    const lines = svg.children.filter(node => node.tag === 'line');
    expect(polygons).toHaveLength(2);
    expect(lines.length).toBeGreaterThan(0);
    for (const polygon of polygons) {
      expect(polygon.props.points.split(' ')).toHaveLength(3);
      expect(polygon.props['fill-opacity']).toBeGreaterThanOrEqual(0.15);
      expect(polygon.props['fill-opacity']).toBeLessThanOrEqual(1);
    }
  });

  it('finds meshes in the selected output and graph outputs beside node outputs', () => {
    const payload = {
      selectedOutput: { id: 'shape', label: 'Shape', value: mesh },
      outputs: { shape: mesh },
      nodeOutputs: {}
    };
    expect(sceneMeshesOf(payload)).toHaveLength(1);
    expect(sceneMeshesOf({ selectedOutput: { value: { representation: 'other' } } })).toHaveLength(0);
    expect(sceneMeshesOf(null)).toHaveLength(0);
  });

  it('renders a quiet blank when the evaluation carries no scene value', () => {
    const surface = createMeshSurface({ vue });
    const tree = surface.render.call({ payload: { outputs: { text: 'plain' } } });
    expect(tree.tag).toBe('div');
    expect(tree.children).toBeUndefined();
  });
});
