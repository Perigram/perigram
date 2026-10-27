// @perigram/plugin-sdk specs: the listing contract, both executor
// harnesses, and the platform API client. These are the plugin author's
// guarantees — the platform's install gate imports the same parseListing,
// so a listing that passes here is publishable there.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseListing, normalizeListing } from './listing.js';
import schema from './listing.schema.json';
import { createEndpointExecutor } from './endpoint-executor.js';
import { runClaimExecutor } from './claim-executor.js';
import { createPluginClient } from './api-client.js';
import { checkSurfaceModule } from './surface-check.js';

const fullListing = {
  pluginId: 'coatings',
  name: 'Coatings',
  version: '2',
  requires: ['documents'],
  declarations: {
    types: [
      { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string' } } },
      { id: 'coating', class: 'item', fields: { code: { base: 'string' } } }
    ],
    services: [
      { id: 'match', signature: { input: { base: 'json' }, output: { base: 'json' } } }
    ],
    editors: [{ type: 'coating-sheet', surface: 'coating-editor', modes: ['edit'] }],
    surfaces: [{ id: 'coating-editor', module: '/surfaces/coating-editor.mjs', surfaceContract: 1 }]
  }
};

describe('parseListing', () => {
  it('parses every declaration layer', () => {
    const layer = parseListing(fullListing);
    expect(layer.pluginId).toBe('coatings');
    expect(layer.types).toHaveLength(2);
    expect(layer.services).toHaveLength(1);
    expect(layer.editors).toEqual([{ type: 'coating-sheet', surface: 'coating-editor', modes: ['edit'] }]);
    expect(layer.requires).toEqual(['documents']);
  });

  it('refuses an editor binding for a type the plugin does not declare', () => {
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, editors: [{ type: 'cassette', surface: 'text-editor', modes: ['edit'] }] }
    })).toThrow(/editor binding for type cassette/);
  });

  it('refuses an editor binding for a non-file type', () => {
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, editors: [{ type: 'coating', surface: 'text-editor', modes: ['edit'] }] }
    })).toThrow(/requires a file type/);
  });

  it('refuses bad plugin ids, empty types, and bad service slugs', () => {
    expect(() => parseListing({ ...fullListing, pluginId: 'Not A Slug' })).toThrow(/pluginId/);
    expect(() => parseListing({ ...fullListing, declarations: { types: [] } })).toThrow(/non-empty array/);
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, services: [{ id: 'NotASlug', signature: { input: {}, output: {} } }] }
    })).toThrow(/slug/);
  });

  it('normalizes the catalog document shape', () => {
    const normalized = normalizeListing(fullListing);
    expect(normalized).toMatchObject({
      pluginId: 'coatings',
      name: 'Coatings',
      version: '2',
      requires: ['documents']
    });
    expect(Object.keys(normalized.declarations)).toEqual([
      'types', 'services', 'editors', 'constructions', 'starterConstructs', 'exports', 'surfaces', 'previews', 'dependencies'
    ]);
  });

  it('keeps the JSON schema in lockstep with the validated fields', () => {
    const declarations = schema.properties.declarations.properties;
    expect(Object.keys(declarations)).toEqual([
      'types', 'services', 'editors', 'surfaces', 'previews', 'constructions', 'starterConstructs', 'exports', 'dependencies'
    ]);
    expect(schema.properties.requires.items.pattern).toBe('^[a-z0-9-]+$');
    expect(schema.properties.visibility.enum).toEqual(['public', 'private']);
  });

  it('validates listing visibility and its owning organizations', () => {
    expect(parseListing(fullListing).visibility).toBe('public');
    const privateListing = parseListing({ ...fullListing, visibility: 'private', organizations: ['org-1'] });
    expect(privateListing.visibility).toBe('private');
    expect(privateListing.organizations).toEqual(['org-1']);
    expect(normalizeListing({ ...fullListing, visibility: 'private', organizations: ['org-1'] }))
      .toMatchObject({ visibility: 'private', organizations: ['org-1'] });
    // A public listing carries no organizations block on the wire.
    expect(normalizeListing(fullListing).organizations).toBeUndefined();
    expect(() => parseListing({ ...fullListing, visibility: 'secret' })).toThrow(/visibility/);
  });

  it('refuses a plugin requiring itself', () => {
    expect(() => parseListing({ ...fullListing, requires: ['coatings'] })).toThrow(/cannot require itself/);
  });

  it('validates declared runtime dependencies', () => {
    const withDeps = dependencies => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, dependencies }
    });
    const good = [
      { name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' },
      { name: '@milkdown/crepe', version: '7.22.3', module: '/assets/vendor/milkdown-crepe.mjs', license: 'MIT' }
    ];
    expect(withDeps(good).dependencies).toEqual(good);
    for (const injected of ['vue', 'primevue', 'pinia', 'marked', 'dompurify', 'pele']) {
      expect(() => withDeps([{ name: injected, version: '1.0.0', module: `/assets/vendor/${injected}.mjs`, license: 'MIT' }]))
        .toThrow(/host-injected external/);
    }
    expect(() => withDeps([{ name: 'three', version: '0.1', module: '/assets/vendor/a.mjs', license: 'MIT' }, { name: 'three', version: '0.2', module: '/assets/vendor/b.mjs', license: 'MIT' }]))
      .toThrow(/duplicate dependency three/);
    expect(() => withDeps([{ name: 'a', version: '1', module: '/assets/vendor/x.mjs', license: 'MIT' }, { name: 'b', version: '1', module: '/assets/vendor/x.mjs', license: 'MIT' }]))
      .toThrow(/share the module/);
    expect(() => withDeps([{ name: 'three', version: '0.1', module: '/../etc/passwd.js', license: 'MIT' }]))
      .toThrow(/traverse/);
    expect(() => withDeps([{ name: 'Not A Name', version: '1', module: '/assets/vendor/x.mjs', license: 'MIT' }]))
      .toThrow(/npm package name/);
    expect(() => withDeps([{ name: 'three', module: '/assets/vendor/x.mjs', license: 'MIT' }]))
      .toThrow(/version/);
    expect(() => withDeps([{ name: 'three', version: '1', module: '/assets/vendor/x.mjs' }]))
      .toThrow(/license/);
    const crossPlugin = { name: 'cad-viewer', version: '1.7.5', module: 'plugin:tech-drawing/assets/vendor/cad-viewer/cad-viewer.mjs', license: 'MIT' };
    expect(() => withDeps([crossPlugin])).toThrow(/does not require/);
    expect(parseListing({
      ...fullListing,
      requires: ['tech-drawing'],
      declarations: { ...fullListing.declarations, dependencies: [crossPlugin] }
    }).dependencies).toEqual([crossPlugin]);
    expect(() => withDeps([{ name: 'cad-viewer', version: '1.7.5', module: 'plugin:tech-drawing/../etc.mjs', license: 'MIT' }]))
      .toThrow(/does not require/);
    expect(() => parseListing({
      ...fullListing,
      requires: ['tech-drawing'],
      declarations: { ...fullListing.declarations, dependencies: [{ name: 'cad-viewer', version: '1.7.5', module: 'plugin:tech-drawing/../etc.mjs', license: 'MIT' }] }
    })).toThrow(/traverse/);
    expect(() => withDeps([{ name: 'cad-viewer', version: '1.7.5', module: 'plugin:Not A Slug/x.mjs', license: 'MIT' }]))
      .toThrow(/root-relative/);
  });

  it('validates starter constructs: own file type, declared mode, one per type', () => {
    const withConstructs = starterConstructs => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, starterConstructs }
    });
    // coating-sheet is a file type with no declared creation modes — the
    // default 'upload' applies.
    expect(withConstructs([{ typeId: 'coating-sheet', construction: 'upload' }]).starterConstructs)
      .toEqual([{ typeId: 'coating-sheet', construction: 'upload' }]);
    expect(() => withConstructs([{ typeId: 'cassette', construction: 'upload' }])).toThrow(/must reference a type this plugin declares/);
    expect(() => withConstructs([{ typeId: 'coating', construction: 'upload' }])).toThrow(/requires a file type/);
    expect(() => withConstructs([{ typeId: 'coating-sheet', construction: 'editor' }])).toThrow(/does not declare/);
    expect(() => withConstructs([
      { typeId: 'coating-sheet', construction: 'upload' },
      { typeId: 'coating-sheet', construction: 'upload' }
    ])).toThrow(/duplicate starter construct/);
  });

  it('validates type projections: field or endpoint-service resolve, never a handler', () => {
    const withProjections = projections => parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        services: [
          ...fullListing.declarations.services,
          { id: 'extract', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } },
          { id: 'poll-extract', signature: { input: { base: 'json' }, output: { base: 'json' } } }
        ],
        types: [{
          id: 'coating-sheet',
          class: 'file',
          fields: { code: { base: 'string' } },
          projections
        }]
      }
    });
    expect(withProjections([{ id: 'p', resolve: { field: 'fields.code' } }]).types[0].projections).toHaveLength(1);
    expect(withProjections([{ id: 'p', resolve: { service: 'plugin.coatings.extract' } }]).types[0].projections).toHaveLength(1);
    expect(() => withProjections([{ id: 'p', resolve: { handler: 'coatings.extract' } }])).toThrow(/handler/);
    expect(() => withProjections([{ id: 'p', resolve: { service: 'plugin.coatings.poll-extract' } }])).toThrow(/endpoint mode/);
    expect(() => withProjections([{ id: 'p', resolve: { service: 'plugin.coatings.match' } }])).toThrow(/endpoint mode/);
    expect(() => withProjections([{ id: 'p', resolve: { service: 'plugin.other.extract' } }])).toThrow(/names plugin other/);
    expect(() => withProjections([{ id: 'p', resolve: {} }])).toThrow(/field or service resolve/);
  });

  it('validates plugin-delivered surface declarations', () => {
    const withSurfaces = surfaces => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, surfaces: [...fullListing.declarations.surfaces, ...surfaces] }
    });
    const surfaces = [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }];
    const combined = [...fullListing.declarations.surfaces, ...surfaces];
    expect(withSurfaces(surfaces).surfaces).toEqual(combined);
    expect(normalizeListing({ ...fullListing, declarations: { ...fullListing.declarations, surfaces: combined } }).declarations.surfaces).toEqual(combined);
    expect(() => withSurfaces([{ id: 'Bad Id', module: '/s.js', surfaceContract: 1 }])).toThrow(/surface id must be a slug/);
    expect(() => withSurfaces([
      { id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 },
      { id: 'coating-designer', module: '/surfaces/other.mjs', surfaceContract: 1 }
    ])).toThrow(/duplicate surface id/);
    expect(() => withSurfaces([{ id: 'coating-designer', module: 'surfaces/x.js', surfaceContract: 1 }]))
      .toThrow(/root-relative/);
    expect(() => withSurfaces([{ id: 'coating-designer', module: '/surfaces/x.mjs', surfaceContract: 0 }]))
      .toThrow(/surfaceContract/);
    expect(() => withSurfaces([{ id: 'coating-designer', module: '/surfaces/x.mjs', surfaceContract: '1' }]))
      .toThrow(/surfaceContract/);
  });

  it('validates preview surfaces and preview bindings', () => {
    const withDeclarations = (surfaces, previews) => parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        surfaces: [...fullListing.declarations.surfaces, ...surfaces],
        previews
      }
    });
    const surfaces = [
      { id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 },
      { id: 'coating-preview', module: '/surfaces/coating-preview.mjs', surfaceContract: 1, kind: 'preview' }
    ];
    const previews = [{ type: 'coating', surface: 'coating-preview' }];
    const layer = withDeclarations(surfaces, previews);
    expect(layer.previews).toEqual(previews);
    expect(normalizeListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, surfaces: [...fullListing.declarations.surfaces, ...surfaces], previews }
    }).declarations.previews).toEqual(previews);
    // A preview surface never targets the editor-grade contract.
    expect(() => withDeclarations([
      { id: 'coating-preview', module: '/surfaces/coating-preview.mjs', surfaceContract: 2, kind: 'preview' }
    ], [])).toThrow(/preview surface coating-preview must target contract 1/);
    expect(() => withDeclarations(surfaces, [{ type: 'coating', surface: 'nope' }]))
      .toThrow(/not a preview surface/);
    // Bindings and kinds agree: an editor binding never mounts a preview
    // surface, a preview binding never mounts an editor surface.
    expect(() => withDeclarations(surfaces, [{ type: 'coating', surface: 'coating-designer' }]))
      .toThrow(/not a preview surface/);
    expect(() => parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        surfaces,
        editors: [{ type: 'coating-sheet', surface: 'coating-preview', modes: ['edit'] }]
      }
    })).toThrow(/not an editor surface/);
    // The bound type must be the plugin's own, once.
    expect(() => withDeclarations(surfaces, [{ type: 'cassette', surface: 'coating-preview' }]))
      .toThrow(/preview binding for type cassette/);
    expect(() => withDeclarations(surfaces, [
      { type: 'coating', surface: 'coating-preview' },
      { type: 'coating', surface: 'coating-preview' }
    ])).toThrow(/exactly one preview per type/);
  });

  it('validates construction and export service bindings', () => {
    const withBindings = listing => parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        ...listing
      }
    });
    expect(() => withBindings({ constructions: { 'coating-sheet': { edit: 'plugin.coatings.match' } } }))
      .toThrow(/does not declare/);
    expect(() => withBindings({ constructions: { 'coating-sheet': { upload: 'plugin.other.match' } } }))
      .toThrow(/names plugin other/);
    expect(() => withBindings({ constructions: { ghost: { upload: 'plugin.coatings.match' } } }))
      .toThrow(/must reference a type this plugin declares/);
    expect(() => withBindings({ exports: [{ typeId: 'coating-sheet', kind: 'PDF_PASSPORT', service: 'plugin.coatings.nope' }] }))
      .toThrow(/does not declare/);
    expect(() => withBindings({ exports: [{ typeId: 'ghost', kind: 'PDF_PASSPORT', service: 'plugin.coatings.match' }] }))
      .toThrow(/must reference a type this plugin declares/);
    const bound = parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        constructions: { 'coating-sheet': { upload: 'plugin.coatings.match' } },
        exports: [{ typeId: 'coating-sheet', kind: 'COATING_DOC', service: 'plugin.coatings.match' }]
      }
    });
    expect(bound).toMatchObject({
      constructions: { 'coating-sheet': { upload: 'plugin.coatings.match' } },
      exports: [{ typeId: 'coating-sheet', kind: 'COATING_DOC', service: 'plugin.coatings.match' }]
    });
  });
});

describe('checkSurfaceModule', () => {
  const surfaceDir = mkdtempSync(join(tmpdir(), 'surface-module-'));
  afterAll(() => { rmSync(surfaceDir, { recursive: true, force: true }); });

  const writeModule = source => {
    const path = join(surfaceDir, `surface-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(path, source);
    return path;
  };

  it('accepts a factory module with a clean import graph', async () => {
    const path = writeModule(`
      export default function createSurface({ vue, components }) {
        const { h } = vue;
        return { name: 'Ok', setup: () => () => h(components.Button, {}, () => 'x') };
      }
    `);
    await expect(checkSurfaceModule(path)).resolves.toBe(true);
  });

  it('accepts an editor-grade module composing the contract-2 context', async () => {
    const path = writeModule(`
      export default function createSurface({ vue, components, queries, notify, access }) {
        const { h, ref, onMounted } = vue;
        if (typeof queries?.list !== 'function' || typeof notify !== 'function' || typeof access?.canWrite !== 'function') {
          throw new Error('contract-2 context missing');
        }
        return {
          name: 'EditorGrade',
          props: { record: { type: Object, default: null }, persistence: { type: Object, default: null } },
          setup(props) {
            const rows = ref([]);
            onMounted(async () => {
              try {
                rows.value = await queries.list('some-type');
                notify({ severity: 'info', summary: 'loaded' });
              } catch {}
            });
            return () => h('div', [access.canWrite(props.record) ? h(components.Button) : null]);
          }
        };
      }
    `);
    await expect(checkSurfaceModule(path)).resolves.toBe(true);
  });

  it('refuses modules importing host externals', async () => {
    const vueImport = writeModule(`import { h } from 'vue';\nexport default () => ({ render: () => null });`);
    await expect(checkSurfaceModule(vueImport)).rejects.toThrow(/self-contained.*found: vue/);
    const primeImport = writeModule(`import Button from 'primevue/button';\nexport default () => ({ render: () => null });`);
    await expect(checkSurfaceModule(primeImport)).rejects.toThrow(/primevue/);
  });

  it('refuses npm dependencies anywhere in the module graph, not just the entry', async () => {
    const leaf = writeModule(`export const parse = () => null;`);
    const offender = writeModule(`import DxfParser from 'dxf-parser';\nexport default () => ({ render: () => null });`);
    const entry = writeModule(`import { parse } from './${leaf.split('/').pop()}';\nexport default () => ({ render: () => parse() });`);
    await expect(checkSurfaceModule(offender)).rejects.toThrow(/dxf-parser/);
    await expect(checkSurfaceModule(entry)).resolves.toBe(true);
    const graphOffender = writeModule(`import { parse } from './${offender.split('/').pop()}';\nexport default () => ({ render: () => parse() });`);
    await expect(checkSurfaceModule(graphOffender)).rejects.toThrow(/dxf-parser/);
  });

  it('refuses a missing factory and a factory that returns nothing', async () => {
    const noFactory = writeModule(`export const something = 1;`);
    await expect(checkSurfaceModule(noFactory)).rejects.toThrow(/default-export the factory/);
    const badFactory = writeModule(`export default () => null;`);
    await expect(checkSurfaceModule(badFactory)).rejects.toThrow(/must return a component/);
  });

  it('refuses a factory that logs errors against the stub context', async () => {
    const logging = writeModule(`export default () => { console.error('boom'); return { render: () => null }; };`);
    await expect(checkSurfaceModule(logging)).rejects.toThrow(/logged errors/);
  });
});

describe('createEndpointExecutor', () => {
  let server;

  afterEach(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    server = null;
  });

  const listen = async options => {
    server = createEndpointExecutor(options).listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    return `http://localhost:${server.address().port}`;
  };

  it('serves each service at POST /<serviceId> with JSON in and out', async () => {
    const base = await listen({ services: { match: async input => ({ matched: input?.code }) } });
    const response = await fetch(`${base}/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'C-1' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: 'C-1' });
  });

  it('answers 404 for unknown services, 405 for non-POST', async () => {
    const base = await listen({ services: { match: async () => null } });
    expect((await fetch(`${base}/other`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/match`)).status).toBe(405);
  });

  it('surfaces handler failures as 500 with the message body', async () => {
    const base = await listen({ services: { match: async () => { throw new Error('bad input'); } } });
    const response = await fetch(`${base}/match`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('bad input');
  });

  it('enforces the executor key when configured', async () => {
    const base = await listen({ services: { match: async () => 'ok' }, token: 'secret' });
    const denied = await fetch(`${base}/match`, { method: 'POST' });
    expect(denied.status).toBe(401);
    const allowed = await fetch(`${base}/match`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret' }
    });
    expect(allowed.status).toBe(200);
  });

  it('serves declared surface modules as static GETs with CORS, refusing traversal', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'executor-static-'));
    mkdirSync(join(staticDir, 'surfaces'), { recursive: true });
    writeFileSync(join(staticDir, 'surfaces', 'editor.mjs'), 'export default () => null;');
    const base = await listen({ services: {}, staticRoot: staticDir });

    const module = await fetch(`${base}/surfaces/editor.mjs`);
    expect(module.status).toBe(200);
    expect(module.headers.get('content-type')).toBe('text/javascript');
    expect(module.headers.get('access-control-allow-origin')).toBe('*');
    expect(await module.text()).toBe('export default () => null;');

    expect((await fetch(`${base}/surfaces/missing.mjs`)).status).toBe(404);
    const traversal = await fetch(`${base}/surfaces/..%2f..%2fetc%2fpasswd`);
    expect([403, 404]).toContain(traversal.status);
    rmSync(staticDir, { recursive: true, force: true });
  });
});

describe('runClaimExecutor', () => {
  const run = { _id: 'run-1', taskId: 'plugin.coatings.match', claimToken: 'ct-1', input: { parameters: { value: { code: 'C-1' } } } };

  const mockPlatform = ({ handler, calls = [] }) => async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, token: options.headers?.['x-worker-token'] });
    if (url.endsWith('/api/tasks/claim')) {
      const served = calls.filter(call => call.url.endsWith('/api/tasks/claim')).length;
      if (served === 1) return json({ run });
      if (served === 2) {
        // Second claim signals a graceful stop by throwing a sentinel the
        // test catches; the loop treats it as a transient error and sleeps.
        throw new Error('STOP');
      }
      return json({ run: null });
    }
    if (url.endsWith('/heartbeat')) return json({ ok: true });
    if (url.endsWith('/complete')) return json({ ok: true });
    if (url.endsWith('/fail')) return json({ ok: true });
    throw new Error(`unexpected ${url}`);
  };

  const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });

  it('claims, executes the service, and completes with the output', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: async input => ({ matched: input?.code }) },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const claim = calls.find(call => call.url.endsWith('/api/tasks/claim'));
    expect(claim.token).toBe('connector-token');
    const complete = calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'));
    expect(complete.body).toEqual({ claimToken: 'ct-1', result: { output: { matched: 'C-1' } } });
  });

  it('fails the run when the handler throws', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: async () => { throw new Error('solver exploded'); } },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const fail = calls.find(call => call.url.endsWith('/api/tasks/run-1/fail'));
    expect(fail.body).toMatchObject({ claimToken: 'ct-1', message: 'solver exploded' });
    expect(calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'))).toBeUndefined();
  });

  it('fails a claimed run for an unknown service instead of dropping it', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: {},
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const fail = calls.find(call => call.url.endsWith('/api/tasks/run-1/fail'));
    expect(fail.body.message).toContain('no handler for service match');
  });

  it('heartbeats while a long handler runs', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 30)) },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(4, calls)
    });
    expect(calls.filter(call => call.url.endsWith('/api/tasks/run-1/heartbeat')).length).toBeGreaterThanOrEqual(1);
    expect(calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'))).toBeTruthy();
  });

  it('requires appUrl and token', async () => {
    await expect(runClaimExecutor({ token: 't', services: {} })).rejects.toThrow(/appUrl/);
    await expect(runClaimExecutor({ appUrl: 'http://app', services: {} })).rejects.toThrow(/connector token/);
  });
});

describe('createPluginClient', () => {
  it('routes each command to its platform endpoint with the right credential', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => JSON.stringify({ pluginId: 'x', ok: true }) };
    };
    const client = createPluginClient({
      appUrl: 'http://app/',
      operatorToken: 'op-token',
      token: 'user-token',
      organizationId: 'org-9',
      fetchImpl
    });

    await client.publish({ pluginId: 'x' });
    await client.install('x');
    await client.connector('x');
    await client.saveSettings('x', { endpoints: { match: 'http://exec/match' }, authToken: 'k' });
    await client.invoke('x', 'match', { code: 'C' });

    const [publish, install, connector, settings, invoke] = calls;
    expect(publish.url).toBe('http://app/api/plugins/catalog');
    expect(publish.options.headers['x-operator-token']).toBe('op-token');
    expect(install.url).toBe('http://app/api/organizations/org-9/plugins');
    expect(install.options.headers.authorization).toBe('Bearer user-token');
    expect(connector.url).toContain('/plugins/x/connector');
    expect(settings.url).toContain('/plugins/x/settings');
    expect(settings.options.method).toBe('POST');
    expect(invoke.url).toBe('http://app/api/admin/commands/plugin.x.match/run');
    expect(JSON.parse(invoke.options.body)).toEqual({ parameters: { code: 'C' } });
  });

  it('names the missing credential instead of failing obscurely', async () => {
    const client = createPluginClient({ appUrl: 'http://app', fetchImpl: async () => { throw new Error('must not fetch'); } });
    await expect(client.publish({})).rejects.toThrow(/PERIGRAM_OPERATOR_TOKEN/);
    const orgScoped = createPluginClient({ appUrl: 'http://app', organizationId: 'org-1', fetchImpl: async () => { throw new Error('must not fetch'); } });
    await expect(orgScoped.install('x')).rejects.toThrow(/PERIGRAM_TOKEN/);
  });
});

describe('declared runtime dependencies (owner decision 2026-10-17)', () => {
  it('accepts a bare import that names a declared dependency, refuses the rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'surface-deps-'));
    try {
      // The author-side reality the check assumes: the plugin repo has
      // its dependencies installed, so node resolves the bare import.
      mkdirSync(join(dir, 'node_modules/three'), { recursive: true });
      writeFileSync(join(dir, 'node_modules/three/package.json'), JSON.stringify({ name: 'three', version: '0.170.0', type: 'module', main: 'index.js' }));
      writeFileSync(join(dir, 'node_modules/three/index.js'), 'export const THREE = true;\n');
      const modulePath = join(dir, 'editor.mjs');
      const declared = [{ name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' }];
      // A bare import without declarations refuses (the mount injects
      // host externals; nothing else may be bare).
      writeFileSync(modulePath, 'import * as THREE from \'three\';\nexport default function createSurface() { return {}; }\n');
      await expect(checkSurfaceModule(modulePath)).rejects.toThrow(/self-contained/);
      // Declared through the listing contract, the same import is legal.
      await expect(checkSurfaceModule(modulePath, { dependencies: declared })).resolves.toBe(true);
      // An undeclared name still refuses.
      writeFileSync(modulePath, 'import * as X from \'xlsx\';\nexport default function createSurface() { return {}; }\n');
      await expect(checkSurfaceModule(modulePath, { dependencies: declared })).rejects.toThrow(/xlsx/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a declared dependency whose vendor module is missing under the plugin root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'surface-deps-'));
    try {
      const modulePath = join(dir, 'editor.mjs');
      writeFileSync(modulePath, 'export default function createSurface() { return {}; }\n');
      const declared = [{ name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' }];
      await expect(checkSurfaceModule(modulePath, { dependencies: declared, pluginRoot: dir }))
        .rejects.toThrow(/serves no module/);
      mkdirSync(join(dir, 'assets/vendor'), { recursive: true });
      writeFileSync(join(dir, 'assets/vendor/three.mjs'), 'export const THREE = true;\n');
      await expect(checkSurfaceModule(modulePath, { dependencies: declared, pluginRoot: dir }))
        .resolves.toBe(true);
      // A cross-plugin module lives under the required plugin's root; the
      // own-root existence rule exempts it.
      const crossPlugin = [{ name: 'cad-viewer', version: '1.7.5', module: 'plugin:tech-drawing/assets/vendor/cad-viewer/cad-viewer.mjs', license: 'MIT' }];
      await expect(checkSurfaceModule(modulePath, { dependencies: crossPlugin, pluginRoot: dir }))
        .resolves.toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects the bare imports of a plugin graph and slugs vendor bundles', async () => {
    const { collectBareImports, vendorSlug } = await import('./vendor.js');
    const dir = mkdtempSync(join(tmpdir(), 'vendor-'));
    try {
      writeFileSync(join(dir, 'editor.mjs'), 'import * as THREE from \'three\';\nimport { lib } from \'./lib.js\';\nexport default function createSurface() { return lib(THREE); }\n');
      writeFileSync(join(dir, 'lib.js'), 'import \'@milkdown/crepe\';\nexport const lib = () => null;\n');
      expect(collectBareImports([join(dir, 'editor.mjs')]).sort()).toEqual(['@milkdown/crepe', 'three']);
      expect(vendorSlug('@milkdown/crepe')).toBe('milkdown-crepe.mjs');
      expect(vendorSlug('three')).toBe('three.mjs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A stop signal that aborts once the mock platform has seen `target`
// requests, so each executor test observes exactly one claimed run.
function stopAfter(target, calls) {
  const controller = new AbortController();
  const tick = () => {
    if (calls.length >= target) controller.abort();
    else setImmediate(tick);
  };
  tick();
  return controller.signal;
}
