import { describe, expect, it } from 'vitest';
import { projectScene3d } from './scene3d.js';

const cube = {
  representation: 'perigram.scene-3d',
  vertices: [
    [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
    [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]
  ],
  faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4]]
};

describe('projectScene3d', () => {
  it('projects faces and derives edges from the face loops', () => {
    const projection = projectScene3d(cube);
    expect(projection.faces).toHaveLength(3);
    expect(projection.edges).toHaveLength(12);
    expect(projection.faces[0]).toMatch(/^[-\d.]+,[-\d.]+ /);
  });

  it('renders nothing for an empty or malformed scene', () => {
    expect(projectScene3d({})).toEqual({ faces: [], edges: [] });
    expect(projectScene3d({ vertices: [[1, 2]], faces: [[0, 1, 2]] })).toEqual({ faces: [], edges: [] });
  });

  it('drops faces whose indices leave the vertex range', () => {
    const projection = projectScene3d({ vertices: cube.vertices, faces: [[0, 1, 99]] });
    expect(projection.faces).toHaveLength(0);
    expect(projection.edges).toHaveLength(0);
  });

  it('preserves source indices when invalid vertices precede valid ones', () => {
    const projection = projectScene3d({
      vertices: [[Number.NaN, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[1, 2, 3]],
      edges: [[1, 2], [2, 3]]
    });
    expect(projection.faces).toHaveLength(1);
    expect(projection.edges).toHaveLength(2);
  });

  it('drops faces and edges that reference invalid or out-of-range vertices', () => {
    const projection = projectScene3d({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [Infinity, 0, 0]],
      faces: [[0, 1, 2], [0, 1, 3], [0, 1, 99]],
      edges: [[0, 1], [1, 3], [0, 99]]
    });
    expect(projection.faces).toHaveLength(1);
    expect(projection.edges).toHaveLength(1);
  });

  it('orbits with yaw and pitch and zooms with the zoom factor', () => {
    const base = projectScene3d(cube);
    const orbited = projectScene3d(cube, { yaw: Math.PI / 4, pitch: Math.PI / 6 });
    expect(orbited.faces[0]).not.toBe(base.faces[0]);
    const zoomed = projectScene3d(cube, { zoom: 2 });
    expect(zoomed.faces).toHaveLength(base.faces.length);
    expect(zoomed.faces[0]).not.toBe(base.faces[0]);
  });

  it('pans the projected scene without changing its topology', () => {
    const base = projectScene3d(cube);
    const panned = projectScene3d(cube, { panX: 40, panY: -25 });
    expect(panned.faces).toHaveLength(base.faces.length);
    expect(panned.faces[0]).not.toBe(base.faces[0]);
    expect(panned.edges).toHaveLength(base.edges.length);
  });

  it('is deterministic for one orbit state', () => {
    const view = { yaw: 0.4, pitch: 0.2, zoom: 1.2 };
    expect(projectScene3d(cube, view)).toEqual(projectScene3d(cube, view));
  });
});
