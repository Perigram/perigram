import { describe, expect, it } from 'vitest';
import { buildCassetteV2FoldedPreview } from './cassetteV2FoldedPreview.js';

describe('cassette v2 folded preview', () => {
  it('places a child face out of the root plane by fold angle', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          workpieceId: 'wp_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          workpieceId: 'wp_1',
          vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        }
      ]
    });
    const root = preview.faces.find(face => face.nodeId === 'face_1');
    const child = preview.faces.find(face => face.nodeId === 'face_2');

    expect(root.points.every(point => point[2] === 0)).toBe(true);
    expect(root.workpieceId).toBe('wp_1');
    expect(Math.max(...child.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
  });

  it('uses the child attachment edge index when placing a folded face', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          vertices: [[100, 70, 0], [0, 70, 0], [0, 40, 0], [100, 40, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 2,
          angle: 90
        }
      ]
    });
    const child = preview.faces.find(face => face.nodeId === 'face_2');

    expect(child.points[2]).toEqual([0, 40, 0]);
    expect(child.points[3]).toEqual([100, 40, 0]);
    expect(Math.max(...child.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
  });

  it('preserves child face offset along the parent edge in folded 3D', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          vertices: [[20, 40, 0], [80, 40, 0], [80, 70, 0], [20, 70, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        }
      ]
    });
    const child = preview.faces.find(face => face.nodeId === 'face_2');

    expect(child.points[0]).toEqual([20, 40, 0]);
    expect(child.points[1]).toEqual([80, 40, 0]);
    expect(Math.max(...child.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
  });

  it('uses uncut reference vertices for folding when a parent face has holes', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          referenceVertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]],
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]],
          holes: [[[20, 30, 0], [40, 30, 0], [40, 36, 0], [20, 36, 0]]]
        },
        {
          nodeId: 'face_2',
          referenceVertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]],
          vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        }
      ]
    });
    const root = preview.faces.find(face => face.nodeId === 'face_1');
    const child = preview.faces.find(face => face.nodeId === 'face_2');

    expect(root.holes).toHaveLength(1);
    expect(child.points[0]).toEqual([100, 40, 0]);
    expect(child.points[1]).toEqual([0, 40, 0]);
    expect(Math.max(...child.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
  });

  it('folds each disconnected workpiece root instead of only the first root', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          workpieceId: 'wp_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          workpieceId: 'wp_1',
          vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
        },
        {
          nodeId: 'face_3',
          workpieceId: 'wp_2',
          vertices: [[200, 0, 0], [300, 0, 0], [300, 40, 0], [200, 40, 0]]
        },
        {
          nodeId: 'face_4',
          workpieceId: 'wp_2',
          vertices: [[300, 40, 0], [200, 40, 0], [200, 70, 0], [300, 70, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        },
        {
          parentId: 'face_3',
          childId: 'face_4',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        }
      ]
    });
    const firstChild = preview.faces.find(face => face.nodeId === 'face_2');
    const secondChild = preview.faces.find(face => face.nodeId === 'face_4');

    expect(Math.max(...firstChild.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
    expect(Math.max(...secondChild.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
  });

  it('aligns workpiece attachments from folded source and target face snaps', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          workpieceId: 'wp_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          workpieceId: 'wp_1',
          vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
        },
        {
          nodeId: 'face_3',
          workpieceId: 'wp_2',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_4',
          workpieceId: 'wp_2',
          vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
        }
      ],
      folds: [
        {
          parentId: 'face_1',
          childId: 'face_2',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        },
        {
          parentId: 'face_3',
          childId: 'face_4',
          parentEdgeIndex: 2,
          childEdgeIndex: 0,
          angle: 90
        }
      ],
      joints: [
        {
          sourceWorkpieceId: 'wp_2',
          sourceFaceId: 'face_4',
          sourceSnap: 'origin',
          targetWorkpieceId: 'wp_1',
          targetFaceId: 'face_2',
          targetSnap: 'origin',
          offsetX: 10,
          offsetY: 5,
          rotation: 0,
          targetSide: 'front'
        }
      ]
    });
    const target = preview.faces.find(face => face.nodeId === 'face_2');
    const source = preview.faces.find(face => face.nodeId === 'face_4');
    const expectedAnchor = [
      target.points[0][0] - 10,
      target.points[0][1],
      target.points[0][2] + 5
    ];

    source.points[0].forEach((value, index) => expect(value).toBeCloseTo(expectedAnchor[index]));
    expect(Math.max(...source.points.map(point => Math.abs(point[2])))).toBeGreaterThan(20);
    expect(preview.attachments).toEqual([expect.objectContaining({
      driver: true,
      status: 'ok'
    })]);
  });

  it('uses only driver joints for placement and reports impossible declared attachments', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [
        {
          nodeId: 'face_1',
          workpieceId: 'wp_1',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_2',
          workpieceId: 'wp_2',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        },
        {
          nodeId: 'face_3',
          workpieceId: 'wp_3',
          vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
        }
      ],
      joints: [
        {
          id: 'driver',
          sourceWorkpieceId: 'wp_3',
          sourceFaceId: 'face_3',
          sourceSnap: 'origin',
          targetWorkpieceId: 'wp_1',
          targetFaceId: 'face_1',
          targetSnap: 'origin',
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          targetSide: 'front',
          driver: true
        },
        {
          id: 'declared',
          sourceWorkpieceId: 'wp_3',
          sourceFaceId: 'face_3',
          sourceSnap: 'origin',
          targetWorkpieceId: 'wp_2',
          targetFaceId: 'face_2',
          targetSnap: 'top_right',
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          targetSide: 'front',
          driver: false
        }
      ]
    });
    const source = preview.faces.find(face => face.nodeId === 'face_3');

    expect(source.points[0]).toEqual([0, 0, 0]);
    expect(preview.attachments.map(attachment => ({
      id: attachment.id,
      driver: attachment.driver,
      status: attachment.status
    }))).toEqual([
      { id: 'driver', driver: true, status: 'ok' },
      { id: 'declared', driver: false, status: 'impossible' }
    ]);
  });

  it('omits integral-cut hanger bodies from folded preview payload', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [{
        nodeId: 'face_1',
        workpieceId: 'wp_1',
        vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]],
        holes: [[
          [20, 20, 0],
          [30, 20, 0],
          [30, 30, 0],
          [20, 30, 0]
        ]]
      }],
      bodies: [{
        id: 'hanger-hw',
        targetFaceId: 'face_1',
        relationId: 'rel_1',
        family: 'hanger_clip',
        productionMode: 'integralCut'
      }],
      cutouts: [{
        id: 'cut_1',
        layer: 'cut.inner',
        targetFaceId: 'face_1',
        relationId: 'rel_1',
        geometry: {
          type: 'polygon',
          vertices: [[20, 20, 0], [30, 20, 0], [30, 30, 0], [20, 30, 0], [20, 20, 0]]
        }
      }]
    });

    expect(preview.bodies).toHaveLength(0);
    expect(preview.cutouts).toHaveLength(1);
  });

  it('extrudes closed profile sections as 3D bodies placed by their array', () => {
    const preview = buildCassetteV2FoldedPreview({
      faces: [{
        nodeId: 'face_1',
        workpieceId: 'wp_1',
        vertices: [[0, 0, 0], [500, 0, 0], [500, 400, 0], [0, 400, 0]]
      }],
      bodies: [{
        id: 'rel_1:wp_2',
        workpieceId: 'wp_2',
        relationId: 'rel_1',
        targetWorkpieceId: 'wp_1',
        targetFaceId: 'face_1',
        targetSnap: 'start',
        targetSide: 'front',
        offsetX: 50,
        offsetY: 30,
        rotation: 0,
        mirrorX: false,
        mirrorY: false,
        pattern: { type: 'edgeArray', edge: 'E2', mode: 'count', count: 2, spacing: 0 },
        family: 'profile',
        productionMode: '',
        parameters: {},
        section: {
          local: [[0, 0], [42, 0], [42, 28], [0, 28]],
          holes: [{ center: [21, 14], diameter: 6 }]
        },
        sweepLength: 100
      }]
    });

    expect(preview.bodies).toHaveLength(2);
    for (const body of preview.bodies) {
      expect(body.family).toBe('profile');
      expect(body.points).toHaveLength(4);
      expect(body.holes).toHaveLength(1);
      expect(body.holes[0]).toHaveLength(25);
      expect(body.length).toBe(100);
      expect(body.normal[2]).not.toBe(0);
    }
    // Array copies sit apart along the bound edge (its direction may
    // run either way).
    expect(Math.abs(preview.bodies[1].center[0] - preview.bodies[0].center[0])).toBeGreaterThan(0);
    // The section rides the face plane (z = 0 face, offset along +y).
    expect(preview.bodies[0].points.every(point => Number.isFinite(point[2]))).toBe(true);
  });
});
