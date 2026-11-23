// cad-occt plugin contract: the generated listing's declared surface
// against the runtime that implements it — discovery through the canonical
// SDK parser, the type-less node-library law, release staging (the wasm
// kernel included), the platform's bare-import law mirrored (every bare
// import in a staged first-party module names a declared dependency whose
// vendor module stages), provider and conversion honesty through
// normalizeNodeProvider, socket semantics (the engine-native shape kind
// refuses geometry.base kinds; STEP and mesh conversions stay explicit),
// the representative primitive → boolean → tessellate chain through the
// real kernel, the handle contract, and refusal guidance.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing, normalizeListing } from '#packages/plugin-sdk/listing';
import { compareNodePorts, normalizeNodeProvider } from '#packages/plugin-sdk/nodes';
import { prepareListingRelease } from '../../server/scripts/lib/plugin-runtime-assets.js';
import { createRuntime, nodeDefinitions, CONVERSIONS } from './runtime/cad-occt.mjs';
import listing from './listing.json';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const provider = 'plugin.cad-occt';

describe('cad-occt listing contract', () => {
  it('validates through the canonical SDK parser the install gate runs', () => {
    const layer = parseListing(listing, 'workers/cad-occt');
    expect(layer.pluginId).toBe('cad-occt');
    expect(layer.requires).toEqual(['geometry-base', 'documents']);
    expect(layer.runtimes).toEqual([{
      id: 'cad-occt',
      language: 'javascript',
      version: '1',
      entry: '/runtime/cad-occt.mjs',
      targets: ['browser', 'server']
    }]);
  });

  it('parses every declared surface module', () => {
    for (const surface of listing.declarations.surfaces) {
      execFileSync(process.execPath, ['--check', resolve(packageRoot, surface.module.slice(1))], { stdio: 'pipe' });
    }
  });

  it('is a type-less node library: no CTS types, every operation a managed pure service of the shared runtime', () => {
    expect(listing.declarations.types).toEqual([]);
    for (const service of listing.declarations.services) {
      expect(service.execution, service.id).toEqual({
        runtime: 'cad-occt',
        kind: 'pure',
        targets: ['browser', 'server'],
        capabilities: [],
        deterministic: true,
        idempotent: true
      });
    }
  });

  it('declares the vendored dependencies with license-gated modules that stage', () => {
    const staged = new Set(prepareListingRelease(normalizeListing(listing), packageRoot).map(asset => asset.path));
    for (const dependency of listing.declarations.dependencies) {
      expect(dependency.license, dependency.name).toMatch(/^(Apache-2.0|MIT)$/);
      expect(staged.has(dependency.module.slice(1)), dependency.name).toBe(true);
    }

  });

  it('stages the complete release: the runtime, its vendor graph, and the wasm kernel the import graph cannot discover as a module', () => {
    const assets = prepareListingRelease(normalizeListing(listing), packageRoot);
    const paths = assets.map(asset => asset.path);
    expect(paths).toContain('listing.json');
    expect(paths).toContain('runtime/cad-occt.mjs');
    expect(paths).toContain('assets/vendor/perigram-plugin-sdk-nodes.mjs');
    for (const dependency of listing.declarations.dependencies) {
      expect(paths, dependency.name).toContain(dependency.module.slice(1));
    }
    const wasm = assets.find(asset => asset.path === 'assets/vendor/occt-wasm.wasm');
    expect(wasm.contentType).toBe('application/wasm');
    expect(wasm.buffer.length).toBeGreaterThan(20 * 1024 * 1024);
    expect(paths).toContain('surfaces/occt-shape-preview.mjs');
    // Every staged module outside the vendor graph is first-party: the
    // runtime entry and the preview surface.
    expect(paths.filter(path => path.endsWith('.mjs') && !path.startsWith('assets/vendor/')).sort())
      .toEqual(['runtime/cad-occt.mjs', 'surfaces/occt-shape-preview.mjs']);
  });

  it('keeps every bare import of a staged first-party module inside the declared dependency set', () => {
    for (const asset of prepareListingRelease(listing, packageRoot)) {
      if (!['runtime/cad-occt.mjs', 'surfaces/occt-shape-preview.mjs'].includes(asset.path)) continue;
      const source = asset.buffer.toString('utf8');
      const declared = new Set(listing.declarations.dependencies.map(dependency => dependency.name));
      for (const match of source.matchAll(/(?:\bimport[\s\S]*?\sfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g)) {
        const specifier = match[2];
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        expect(declared.has(specifier), `${asset.path} imports ${specifier}`).toBe(true);
      }
    }
  });
});

describe('cad-occt provider honesty', () => {
  const runtime = createRuntime();
  const contribution = runtime.providers[0];
  const services = listing.declarations.services;

  it('derives one valid node definition per declared service, with no second catalog', () => {
    expect(contribution.provider).toBe(provider);
    const serviceIds = services.map(service => service.id).sort();
    expect(contribution.definitions.map(definition => definition.id).sort()).toEqual(serviceIds);
    expect(contribution.definitions).toEqual(nodeDefinitions(listing));
    expect(contribution.previewRenderers).toEqual({ 'occt-shape': 'occt-shape-preview' });
    expect(() => normalizeNodeProvider({
      provider,
      definitions: contribution.definitions,
      previewRenderers: contribution.previewRenderers,
      conversions: contribution.conversions,
      execute: () => {}
    })).not.toThrow();
  });

  it('forwards the declared conversions through the provider normalizer (#28)', () => {
    const normalized = normalizeNodeProvider({
      provider,
      definitions: contribution.definitions,
      previewRenderers: contribution.previewRenderers,
      conversions: contribution.conversions,
      execute: () => {}
    });
    expect(normalized.conversions.map(conversion => conversion.id)).toEqual([
      'occt-shape-to-step-file',
      'step-file-to-occt-shape',
      'occt-shape-to-mesh'
    ]);
    expect(CONVERSIONS.map(conversion => conversion.fidelity)).toEqual(['lossless', 'lossless', 'semantically-lossy']);
  });
});

describe('cad-occt socket semantics', () => {
  const definitions = nodeDefinitions(listing);
  const byId = id => definitions.find(definition => definition.id === id);
  const outputOf = id => byId(id).outputs[0];
  const inputOf = (id, port) => byId(id).inputs.find(candidate => candidate.id === port);

  it('declares the engine-native shape kind on every shape port', () => {
    for (const port of [inputOf('fuse-shapes', 'a'), inputOf('cut-shapes', 'base'), outputOf('make-box')]) {
      expect(port.semantic).toEqual({ base: 'json', kind: 'geometry.occt.shape' });
    }
  });

  it('maps geometry.base kinds exactly where the brepjs signature carries them', () => {
    expect(inputOf('make-box', 'at').semantic).toEqual({ base: 'json', kind: 'geometry.point3', unit: 'mm', nullable: true });
    expect(inputOf('make-cylinder', 'axis').semantic).toEqual({ base: 'json', kind: 'geometry.vector3', unit: 'mm', nullable: true });
    expect(inputOf('rotate-shape', 'angle').semantic).toEqual({ base: 'number', kind: 'geometry.angle', nullable: true });
  });

  it('refuses accidental wiring between the shape kind and geometry.base kinds', () => {
    const point = { shape: 'item', semantic: { base: 'json', kind: 'geometry.point3', unit: 'mm' } };
    // The kind qualifier refuses; the differing unit surfaces first as a
    // conversion need nothing declared serves.
    expect(compareNodePorts(point, inputOf('fuse-shapes', 'a')).compatible).toBe(false);
    expect(compareNodePorts(outputOf('make-box'), point).compatible).toBe(false);
    expect(compareNodePorts(
      point,
      { shape: 'item', semantic: { base: 'json', kind: 'geometry.occt.shape', unit: 'mm' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(compareNodePorts(outputOf('make-box'), inputOf('cut-shapes', 'base')).status).toBe('exact');
  });

  it('produces the mesh channel value the graph output contract renders', () => {
    expect(outputOf('tessellate-shape').semantic).toEqual({ base: 'json', representation: 'perigram.scene-3d' });
  });

  it('carries the documents file payload kind on STEP exchange', () => {
    expect(outputOf('export-step').semantic).toEqual({ base: 'json', kind: 'documents.file' });
    expect(inputOf('import-step', 'file').semantic).toEqual({ base: 'json', kind: 'documents.file' });
  });
});

describe('cad-occt runtime through the real kernel', () => {
  it('evaluates primitive → boolean → tessellate and exports the exact B-rep as STEP', async () => {
    const runtime = createRuntime();
    const plate = await runtime.execute('make-box', { width: 30, depth: 20, height: 10 });
    const hole = await runtime.execute('make-cylinder', { radius: 5, height: 15, at: { x: 15, y: 10, z: -2 } });
    const drilled = await runtime.execute('cut-shapes', { base: plate, tool: hole });
    const mesh = await runtime.execute('tessellate-shape', { shape: drilled });

    expect(plate).toEqual({ handle: 'occt-1', brep: expect.any(String) });
    expect(drilled.brep.length).toBeGreaterThan(0);
    expect(mesh.representation).toBe('perigram.scene-3d');
    expect(mesh.vertices.length).toBeGreaterThan(100);
    expect(mesh.faces.length).toBeGreaterThan(100);
    expect(mesh.normals).toHaveLength(mesh.vertices.length);
    for (const vertex of mesh.vertices) {
      expect(vertex.every(component => Number.isFinite(component))).toBe(true);
    }

    const step = await runtime.execute('export-step', { shape: drilled });
    expect(step.payload.mime).toBe('application/step');
    expect(step.payload.name).toBe('part.step');
    const reimported = await runtime.execute('import-step', { file: step });
    expect(reimported.brep.length).toBeGreaterThan(0);
  });

  it('answers the graph invocation envelope the managed dispatch sends', async () => {
    const runtime = createRuntime();
    const box = await runtime.execute('make-box', {
      mode: 'preview',
      nodeId: 'n1',
      inputs: { width: 10, depth: 10, height: 10 },
      config: {}
    });
    expect(box).toEqual({ value: { handle: expect.any(String), brep: expect.any(String) } });
  });

  it('honors the handle contract: handles resolve inside the runtime, BREP rebuilds across boundaries', async () => {
    const runtime = createRuntime();
    const first = await runtime.execute('make-sphere', { radius: 3 });
    expect(await runtime.clearExecution()).toBe(true);
    // The table emptied: the same wire value resolves through its BREP.
    const moved = await runtime.execute('translate-shape', { shape: first, offset: { x: 1, y: 0, z: 0 } });
    expect(moved.brep.length).toBeGreaterThan(0);
    expect(await runtime.clearExecution()).toBe(true);
    expect(await runtime.clearExecution()).toBe(false);
  });

  it('refuses shape ports without the BREP form and non-finite geometry', async () => {
    const runtime = createRuntime();
    await expect(runtime.execute('fuse-shapes', { a: { handle: 'occt-9' }, b: { handle: 'occt-10' } }))
      .rejects.toThrow(/requires a geometry\.occt\.shape value/);
    const sphere = await runtime.execute('make-sphere', { radius: 2 });
    await expect(runtime.execute('translate-shape', {
      shape: sphere,
      offset: { x: Number.NaN, y: 0, z: 0 }
    })).rejects.toThrow(/finite x, y, z components/);
    await expect(runtime.execute('make-torus', {})).rejects.toThrow(/Unsupported cad-occt operation/);
  });
});
