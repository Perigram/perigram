// Geometry base plugin contract: the listing's declared surface against
// the runtime that implements it — discovery through the canonical SDK
// parser, the type-less node-library law, release staging, provider
// derivation honesty, palette honesty through the wireable gate, socket
// projection and semantic compatibility (kinds refuse accidental wiring;
// conversions stay explicit), the representative construct → transform →
// query chain through the real runtime, and refusal guidance. The math
// laws (runtime/math.spec.js) carry their own coverage.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing, normalizeListing } from '@perigram/plugin-sdk/listing';
import { compareNodePorts, normalizeNodeProvider } from '@perigram/plugin-sdk/nodes';
import { pluginPaletteGroups, resolveCatalogNodePorts } from '@perigram/processes';
import { prepareListingRelease } from '../../server/scripts/lib/plugin-runtime-assets.js';
import { createRuntime, nodeDefinitions, CONVERSIONS } from './runtime/geometry-base.mjs';
import listing from './listing.json';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const provider = 'plugin.geometry-base';

// The platform composes only wireable services into the palette
// (servicesForOrganization's record-input gate).
const wireable = service => {
  const input = service.signature?.input;
  return !input || input.base === 'record';
};

describe('Geometry base listing contract', () => {
  it('validates through the canonical SDK parser the install gate runs', () => {
    const layer = parseListing(listing, 'workers/geometry-base');
    expect(layer.pluginId).toBe('geometry-base');
    expect(layer.runtimes).toEqual([{
      id: 'geometry-base',
      language: 'javascript',
      version: '1',
      entry: '/runtime/geometry-base-bundle.mjs',
      targets: ['browser', 'server']
    }]);
  });

  it('is a type-less node library: no CTS types, every operation a managed pure service of the shared runtime', () => {
    expect(listing.declarations.types).toEqual([]);
    for (const service of listing.declarations.services) {
      expect(service.execution, service.id).toEqual({
        runtime: 'geometry-base',
        kind: 'pure',
        targets: ['browser', 'server'],
        capabilities: [],
        deterministic: true,
        idempotent: true
      });
    }
    // The node-library law cuts both ways: a listing with neither types
    // nor runtimes refuses.
    const stripped = structuredClone(listing);
    stripped.declarations.runtimes = [];
    expect(() => parseListing(stripped, 'workers/geometry-base')).toThrow(/declarations need CTS types or a declared runtime/);
  });

  it('stages the complete release: the self-contained bundle the listing names', () => {
    const paths = prepareListingRelease(normalizeListing(listing), packageRoot).map(asset => asset.path);
    expect(paths).toEqual(['runtime/geometry-base-bundle.mjs']);
    for (const asset of prepareListingRelease(listing, packageRoot)) {
      if (asset.path.endsWith('.mjs') && /import\s+from\s+['"][a-z@]/.test(asset.buffer.toString('utf8'))) {
        throw new Error(`Staged module ${asset.path} carries a bare import — the browser runtime must be self-contained`);
      }
    }
  });

  it('ships a bundle whose runtime equals the source-derived provider', async () => {
    const bundled = await import('./runtime/geometry-base-bundle.mjs');
    const bundledRuntime = bundled.createRuntime();
    expect(bundledRuntime.providers[0].definitions).toEqual(nodeDefinitions(listing));
    expect(bundledRuntime.providers[0].conversions).toEqual(CONVERSIONS);
    expect(bundledRuntime.execute('make-point3', { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('keeps every signature kind inside the geometry namespace it owns', () => {
    const descriptors = listing.declarations.services.flatMap(service => [
      ...Object.values(service.signature.input.fields || {}),
      service.signature.output
    ]);
    for (const descriptor of descriptors) {
      if (descriptor.kind) expect(descriptor.kind).toMatch(/^geometry\.(point3|vector3|plane|frame|angle)$/);
      if (descriptor.unit) expect(['mm']).toContain(descriptor.unit);
    }
  });
});

describe('Geometry base provider honesty', () => {
  const runtime = createRuntime();
  const contribution = runtime.providers[0];
  const services = listing.declarations.services;

  it('derives one valid node definition per declared service, with no second catalog', () => {
    expect(contribution.provider).toBe(provider);
    const serviceIds = services.map(service => service.id).sort();
    expect(contribution.definitions.map(definition => definition.id).sort()).toEqual(serviceIds);
    expect(contribution.definitions).toEqual(nodeDefinitions(listing));
    // The same validation the browser session and the managed worker
    // apply to loaded providers (#28): conversions forward with the
    // definitions.
    expect(() => normalizeNodeProvider({
      provider: contribution.provider,
      definitions: contribution.definitions,
      conversions: contribution.conversions,
      execute: () => {}
    })).not.toThrow();
  });

  it('pins every definition to the declared runtime with browser execution support', () => {
    for (const definition of contribution.definitions) {
      expect(definition.execution, definition.id).toMatchObject({
        runtime: 'geometry-base',
        kind: 'pure',
        targets: ['browser', 'server'],
        capabilities: [],
        deterministic: true,
        idempotent: true
      });
      expect(definition.palette.group, definition.id).toMatch(/^(points-vectors|planes-frames|conversions)$/);
    }
  });

  it('projects typed sockets from the listing signatures the way the platform derives them', () => {
    const byId = Object.fromEntries(contribution.definitions.map(definition => [definition.id, definition]));
    expect(byId['make-point3'].inputs).toEqual([
      expect.objectContaining({ id: 'x', required: false, default: 0, semantic: { base: 'number', nullable: true } }),
      expect.objectContaining({ id: 'y', required: false, default: 0, semantic: { base: 'number', nullable: true } }),
      expect.objectContaining({ id: 'z', required: false, default: 0, semantic: { base: 'number', nullable: true } })
    ]);
    expect(byId['make-point3'].outputs).toEqual([
      expect.objectContaining({ id: 'value', required: true, semantic: { base: 'json', kind: 'geometry.point3', unit: 'mm' } })
    ]);
    expect(byId['plane-distance'].inputs).toEqual([
      expect.objectContaining({ id: 'plane', semantic: { base: 'json', kind: 'geometry.plane', unit: 'mm' } }),
      expect.objectContaining({ id: 'point', semantic: { base: 'json', kind: 'geometry.point3', unit: 'mm' } })
    ]);
    expect(byId['vector-angle'].outputs).toEqual([
      expect.objectContaining({ semantic: { base: 'number', kind: 'geometry.angle' } })
    ]);
    expect(byId['make-frame'].inputs.find(port => port.id === 'xAxisHint')).toMatchObject({
      required: false,
      semantic: { base: 'json', kind: 'geometry.vector3', unit: 'mm', nullable: true }
    });
  });
});

describe('Geometry base palette honesty', () => {
  it('keeps every service wireable with a stable semantic group', () => {
    for (const service of listing.declarations.services) {
      expect(wireable(service), service.id).toBe(true);
      expect(service.palette.group, service.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(service.palette.label, service.id).toBeTruthy();
    }
  });

  it('composes the declared groups through the wireable gate the designer rides', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: `${provider}.${service.id}`, pluginId: listing.pluginId }
    ]));
    const groups = pluginPaletteGroups({}, services);
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-geometry-base', source: 'plugin' });
    expect(section.subgroups.map(group => group.id).sort()).toEqual([
      'conversions', 'planes-frames', 'points-vectors'
    ]);
    expect(section.subgroups.flatMap(group => group.items)).toHaveLength(listing.declarations.services.length);
    for (const item of section.subgroups.flatMap(group => group.items)) {
      expect(item.kind).toBe('cts.service');
    }
  });
});

describe('Geometry base socket projection', () => {
  it('derives data sockets from the wireable service signature', () => {
    const scale = listing.declarations.services.find(service => service.id === 'vector-scale');
    const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: `${provider}.vector-scale` }, {
      domain: { serviceContracts: { [`${provider}.vector-scale`]: { ...scale, command: `${provider}.vector-scale` } } }
    });
    const dataInputs = ports.inputs.filter(socket => socket.role !== 'control');
    expect(dataInputs.map(socket => socket.id)).toEqual(['v', 'factor']);
    expect(dataInputs[0]).toMatchObject({ required: true });
    expect(dataInputs[1]).toMatchObject({ required: false });
    expect(ports.outputs.filter(socket => socket.role !== 'control')).toHaveLength(1);
  });
});

describe('Geometry base socket semantics', () => {
  const point = { shape: 'item', semantic: { base: 'json', kind: 'geometry.point3', unit: 'mm' } };
  const vector = { shape: 'item', semantic: { base: 'json', kind: 'geometry.vector3', unit: 'mm' } };
  const genericJson = { shape: 'item', semantic: { base: 'json' } };

  it('matches identical kinds exactly and feeds generic json safely', () => {
    expect(compareNodePorts(point, point)).toMatchObject({ status: 'exact', compatible: true });
    expect(compareNodePorts(point, genericJson)).toMatchObject({ status: 'safe-coercion', compatible: true });
    expect(compareNodePorts(genericJson, point)).toMatchObject({ status: 'conditional', compatible: true });
  });

  it('refuses accidental cross-kind wiring: conversions stay explicit graph operations', () => {
    expect(compareNodePorts(point, vector)).toMatchObject({ status: 'incompatible', compatible: false });
  });

  it('requires an explicit conversion across length units', () => {
    const metres = { shape: 'item', semantic: { base: 'json', kind: 'geometry.point3', unit: 'm' } };
    expect(compareNodePorts(metres, point)).toMatchObject({ status: 'conversion-required', compatible: false });
  });

  it('declares the exact kind reinterpretations with lossless fidelity', () => {
    expect(CONVERSIONS).toEqual([
      expect.objectContaining({
        id: 'point3-to-vector3',
        from: { base: 'json', kind: 'geometry.point3', unit: 'mm' },
        to: { base: 'json', kind: 'geometry.vector3', unit: 'mm' },
        provider,
        runtime: 'geometry-base',
        deterministic: true,
        fidelity: 'lossless'
      }),
      expect.objectContaining({
        id: 'vector3-to-point3',
        from: { base: 'json', kind: 'geometry.vector3', unit: 'mm' },
        to: { base: 'json', kind: 'geometry.point3', unit: 'mm' },
        provider,
        runtime: 'geometry-base',
        deterministic: true,
        fidelity: 'lossless'
      })
    ]);
    const runtime = createRuntime();
    const point3Value = { x: 12.5, y: -0.125, z: 1e3 };
    const asVector = runtime.execute('point-to-vector', { point: point3Value });
    expect(asVector).toEqual(point3Value);
    expect(runtime.execute('vector-to-point', { vector: asVector })).toEqual(point3Value);
  });
});

describe('Geometry base workflow chain', () => {
  const runtime = createRuntime();
  const graphCall = (operationId, inputs, config = {}) => runtime.execute(operationId, {
    mode: 'preview', inputs, config
  });

  it('constructs, transforms, and queries through the graph invocation envelope', () => {
    const origin = runtime.execute('make-point3', { x: 10, y: 0, z: 5 });
    const zAxis = runtime.execute('make-vector3', { x: 0.6, y: 0, z: 0.8 });
    const frame = graphCall('make-frame', { origin, zAxis, xAxisHint: { x: 0, y: 1, z: 0 } });
    expect(frame).toEqual({ value: expect.objectContaining({ origin }) });
    const above = graphCall('point-translate', { point: origin, offset: { x: 6, y: 0, z: 8 } });
    const local = graphCall('point-to-local', { frame: frame.value, point: above.value });
    expect(local.value.x).toBeCloseTo(0, 12);
    expect(local.value.y).toBeCloseTo(0, 12);
    expect(local.value.z).toBeCloseTo(10, 12);
    const restored = graphCall('point-to-world', { frame: frame.value, point: local.value });
    expect(restored.value).toEqual(above.value);

    const plane = graphCall('make-plane', { origin, normal: zAxis });
    const distance = graphCall('plane-distance', { plane: plane.value, point: above.value });
    expect(distance.value).toBeCloseTo(10, 12);

    const axis = graphCall('frame-axis', { frame: frame.value });
    expect(axis.value).toEqual(frame.value.zAxis);
  });

  it('answers named refusals for degenerate and malformed inputs', () => {
    expect(() => runtime.execute('make-plane', { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } }))
      .toThrow(/non-zero normal/);
    expect(() => runtime.execute('vector-normalize', { v: { x: 0, y: 0, z: 0 } }))
      .toThrow(/zero-length/);
    expect(() => runtime.execute('make-point3', { x: Number.NaN })).toThrow(/finite number/);
    expect(() => runtime.execute('point-to-local', {
      frame: { origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 2, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } },
      point: { x: 0, y: 0, z: 0 }
    })).toThrow(/unit length/);
    expect(() => runtime.execute('frame-axis', { frame: runtime.execute('make-frame', { origin: { x: 0, y: 0, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } }), axis: 'w' }))
      .toThrow(/axis must be one of/);
    expect(() => graphCall('make-frame', {})).toThrow(/origin/);
  });
});
