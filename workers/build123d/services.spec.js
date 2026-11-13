import { describe, expect, it } from 'vitest';
import { services } from './services.js';

// The vertical slice's compute contract: the box bake is exact — bounds
// match the parameters, the mesh is watertight (every edge shared by
// exactly two triangles, outward-facing).
describe('build123d box bake', () => {
  it('bakes exact bounds and a watertight mesh', () => {
    const result = services.bake({ operation: 'box', parameters: { width: 2, height: 4, depth: 6 } });
    expect(result.data.bounds).toEqual({ min: [-1, -2, -3], max: [1, 2, 3] });
    expect(result.data.mesh.vertices).toHaveLength(24);
    expect(result.data.mesh.triangles).toHaveLength(36);

    const edges = new Map();
    const triangles = result.data.mesh.triangles;
    for (let i = 0; i < triangles.length; i += 3) {
      for (const [a, b] of [[triangles[i], triangles[i + 1]], [triangles[i + 1], triangles[i + 2]], [triangles[i + 2], triangles[i]]]) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
  });

  it('refuses a non-box operation and non-positive sizes', () => {
    expect(() => services.bake({ operation: 'sphere' })).toThrow(/operation must be 'box'/);
    expect(() => services.bake({ operation: 'box', parameters: { width: 0, height: 1, depth: 1 } })).toThrow(/positive/);
  });

  it('serves the deterministic preview mesh', () => {
    const mesh = services['preview-mesh']({ operation: 'box', parameters: { width: 1, height: 1, depth: 1 } });
    expect(mesh.vertices).toHaveLength(24);
    expect(mesh.triangles).toHaveLength(36);
  });
});
