import { describe, expect, it } from 'vitest';
import { scene3dGeometry } from './scene3d.js';

const cube = {
  representation: 'perigram.scene-3d',
  vertices: [
    [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
    [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]
  ],
  faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4]]
};

describe('scene3dGeometry', () => {
  it('triangulates faces and derives unique edges from the face loops', () => {
    const geometry = scene3dGeometry(cube);
    expect(geometry.vertexCount).toBe(8);
    expect(geometry.triangleCount).toBe(6);
    expect(geometry.edgeCount).toBe(10);
    expect(geometry.triangles).toEqual([0, 0, 1, 1, 2, 2]);
    expect(geometry.indices.slice(0, 6)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('returns an empty buffer set for an empty or malformed scene', () => {
    expect(scene3dGeometry({})).toMatchObject({ vertexCount: 0, triangleCount: 0, edgeCount: 0, bounds: null });
    expect(scene3dGeometry({ vertices: [[1, 2]], faces: [[0, 1, 2]] })).toMatchObject({ vertexCount: 0 });
  });

  it('drops faces and edges whose indices leave the vertex range', () => {
    const geometry = scene3dGeometry({ vertices: cube.vertices, faces: [[0, 1, 99]], edges: [[0, 1], [0, 99]] });
    expect(geometry.triangleCount).toBe(0);
    expect(geometry.edgeCount).toBe(1);
  });

  it('keeps source indexes stable when invalid vertices precede valid ones', () => {
    const geometry = scene3dGeometry({
      vertices: [[Number.NaN, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[1, 2, 3]],
      edges: [[1, 2], [2, 3]]
    });
    expect(geometry.vertexCount).toBe(3);
    expect(geometry.indices).toEqual([1, 2, 3]);
    expect(geometry.edges).toEqual([1, 2, 2, 3]);
    expect(geometry.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0], center: [0.5, 0.5, 0] });
  });

  it('carries per-vertex normals when they parallel the vertex array', () => {
    const normals = cube.vertices.map(() => [0, 0, 1]);
    expect(scene3dGeometry({ ...cube, normals }).normals).toHaveLength(24);
    expect(scene3dGeometry({ ...cube, normals: [[0, 0, 1]] }).normals).toEqual([]);
  });

  it('bounds the scene from valid vertices alone', () => {
    const geometry = scene3dGeometry({
      vertices: [[-2, -3, -4], [2, 3, 4], [Infinity, 0, 0]],
      faces: [[0, 1, 2]]
    });
    expect(geometry.bounds).toEqual({ min: [-2, -3, -4], max: [2, 3, 4], center: [0, 0, 0] });
    expect(geometry.triangleCount).toBe(0);
  });

  it('does not reorder or rewrite source vertex indexes', () => {
    const geometry = scene3dGeometry({ vertices: cube.vertices, faces: [[7, 6, 5, 4]] });
    expect(geometry.indices).toEqual([7, 6, 5, 7, 5, 4]);
    expect(geometry.edges).toEqual([7, 6, 6, 5, 5, 4, 4, 7]);
  });
});
