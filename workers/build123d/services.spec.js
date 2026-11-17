// The build123d plugin executor's guard suite: catalog integrity,
// listing validity, and the live engine vertical (skipped loudly when
// python3 lacks build123d — the catalog and listing still guard).
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseListing } from '@perigram/plugin-sdk/listing';
import catalog from './catalog.json' with { type: 'json' };
import listing from './listing.json' with { type: 'json' };

const python = (() => {
  try {
    execFileSync('python3', ['-c', 'import build123d'], { stdio: 'ignore' });
    return 'python3';
  } catch {
    return null;
  }
})();

function dispatch(request) {
  const output = execFileSync('python3', [new URL('./dispatch.py', import.meta.url).pathname], {
    input: JSON.stringify(request),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return JSON.parse(output);
}

describe('catalog', () => {
  it('records provenance and palette placement on every op', () => {
    expect(catalog.provenance.source).toBe('build123d');
    expect(catalog.provenance.version).toMatch(/^\d+\.\d+/);
    const ids = new Set();
    for (const op of catalog.ops) {
      expect(op.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(op.id), op.id).toBe(false);
      ids.add(op.id);
      expect(op.palette.group).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
      expect(op.target).toMatch(/^build123d(?:\.[a-z_0-9]+)+:[A-Za-z_.]+$/);
      for (const param of op.params) {
        expect(['number', 'boolean', 'string', 'shape', 'json']).toContain(param.type);
      }
    }
  });

  it('carries the shape algebra with a receiver param', () => {
    const union = catalog.ops.find(op => op.id === 'union');
    expect(union.kind).toBe('operator');
    expect(union.params.map(param => param.name)).toEqual(['shape', 'other']);
  });
});

describe('listing', () => {
  it('validates through the SDK contract', () => {
    expect(() => parseListing(listing)).not.toThrow();
  });

  it('registers every discovered op as a deterministic endpoint service', () => {
    const services = listing.declarations.services;
    expect(services.map(service => service.id).sort()).toEqual(catalog.ops.map(op => op.id).sort());
    for (const service of services) {
      expect(service.mode).toBe('endpoint');
      expect(service.cache).toBe('deterministic');
      expect(service.signature.input.base).toBe('record');
      expect(service.signature.output.base).toBe('json');
    }
  });
});

describe.skipIf(python === null)('live engine vertical', () => {
  it('composes real B-Rep through the generic dispatch', () => {
    const box = dispatch({ op: 'box', args: { length: 2, width: 3, height: 4 } });
    expect(box.kind).toBe('shape');
    expect(box.volume).toBeCloseTo(24, 6);
    expect(box.bounds).toEqual({ min: [-1, -1.5, -2], max: [1, 1.5, 2] });

    const cylinder = dispatch({ op: 'cylinder', args: { radius: 1, height: 5 } });
    const union = dispatch({ op: 'union', args: { shape: box, other: cylinder } });
    expect(union.volume).toBeGreaterThan(24);
    expect(union.volume).toBeLessThan(24 + Math.PI * 5);

    const intersection = dispatch({ op: 'intersect', args: { shape: box, other: cylinder } });
    expect(union.volume + intersection.volume).toBeCloseTo(24 + Math.PI * 5, 3);
  });

  it('extrudes a sketch through a STEP round trip', () => {
    const circle = dispatch({ op: 'circle', args: { radius: 2 } });
    const extruded = dispatch({ op: 'extrude', args: { to_extrude: circle, amount: 3 } });
    expect(extruded.volume).toBeCloseTo(Math.PI * 4 * 3, 3);
  });

  it('refuses with the op and parameter named', () => {
    expect(() => dispatch({ op: 'box', args: { length: 1 } })).toThrowError(/width is required/);
    expect(() => dispatch({ op: 'unknown-op', args: {} })).toThrowError(/unknown op/);
  });
});
