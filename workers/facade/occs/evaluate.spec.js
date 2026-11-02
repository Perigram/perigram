import { describe, expect, it } from 'vitest';
import { createDefaultOccsCassetteTemplateDefinition } from './templates.js';
import { evaluateOccsCassetteTemplate } from './evaluate.js';
import {
  addCassetteV2ProfileWorkpiece,
  addCassetteV2Workpiece,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  updateCassetteV2FaceSketch
} from '../surfaces/lib/cassetteV2Renderer.js';
import {
  createDefaultOccsProfileSketch,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from './profiles.js';

const openChainSketch = (points, parameters = {}) => normalizeOccsProfileSketch({
  parameters,
  shapes: [{
    id: 's0',
    type: 'chain',
    op: 'none',
    closed: false,
    points: points.map((point, index) => ({ id: `p${index}`, x: point[0], y: point[1] })),
    edges: points.slice(0, -1).map((_, index) => ({ id: `e${index}`, from: `p${index}`, to: `p${index + 1}` }))
  }]
});

describe('OCCS cassette evaluation', () => {
  it('embeds the open-profile composite into the evaluated contour and nesting', async () => {
    const openSketch = openChainSketch(
      [[0, 0], [30, 0], [30, 20], [0, 20]].slice(0, 3),
      { W: 30, H: 20 }
    );
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      kind: 'hanger',
      process: 'extruded',
      parameters: openSketch.parameters,
      occsProfile: occsProfileFromSketch(openSketch),
      sketch: openSketch
    });
    const definition = await createCassetteV2OccsDocument(added.tree);
    const result = await evaluateOccsCassetteTemplate(definition, {});

    // The whole bound edge is replaced by the composite chain: host edge
    // start, the placed profile copies, host edge end — one chain per
    // relation, riding the contour layer for redraw.
    const embedded = result.layerData.filter(item => item.layer === 'contour.cassette_face');
    expect(embedded).toHaveLength(1);
    expect(embedded[0].relationId).toBeTruthy();
    expect(embedded[0].profileWorkpieceId).toBeTruthy();
    const coordinates = embedded[0].coordinates;
    expect(coordinates.length).toBeGreaterThan(3);
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    // The composite spans the host edge: its ends are the host vertices,
    // never a closed ring.
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(0.001);
    // Nesting follows the truly embedded boundary: the polygon vertex
    // count grows past the plain face contour by the copy interiors.
    expect(result.nestingPolygons).toHaveLength(1);
    const plain = await evaluateOccsCassetteTemplate(
      await createCassetteV2OccsDocument(createCassetteV2GraphTree()), {}
    );
    expect(result.nestingPolygons[0].coordinates.length)
      .toBeGreaterThan(plain.nestingPolygons[0].coordinates.length);
  });

  it('cuts closed profile sections into the evaluated face and names them on the cut layer', async () => {
    const square = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      kind: 'hanger',
      process: 'extruded',
      parameters: square.parameters,
      occsProfile: occsProfileFromSketch(square),
      sketch: square
    });
    const relations = await import('../surfaces/lib/cassetteV2Renderer.js');
    const relation = relations.getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = relations.updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '3',
      offsetX: '50',
      offsetY: '30'
    });

    const definition = await createCassetteV2OccsDocument(tree);
    const result = await evaluateOccsCassetteTemplate(definition, {});
    const profileCuts = result.layerData.filter(item => item.layer === 'cut.inner');
    // Three placed copies; each copy's subtract operand (the template's
    // D circle) rides the inner-cut layer, the copy's add operand
    // (the template rect) unites into the face contour instead.
    const cutIds = new Set(profileCuts.map(cut => cut.handles[0].replace(/:\d+$/, '')));
    expect(cutIds.size).toBe(3);
    expect(profileCuts).toHaveLength(3);
    for (const cut of profileCuts) {
      expect(cut.relationId).toBe(relation.id);
      expect(cut.profileWorkpieceId).toBeTruthy();
      expect(cut.coordinates.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('refuses open-profile placements that overflow or overlap', async () => {
    const longSketch = openChainSketch([[0, 0], [5000, 0]]);
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Too long strip',
      kind: 'hanger',
      process: 'extruded',
      parameters: longSketch.parameters,
      occsProfile: occsProfileFromSketch(longSketch),
      sketch: longSketch
    });
    const definition = await createCassetteV2OccsDocument(added.tree);
    await expect(evaluateOccsCassetteTemplate(definition, {})).rejects.toThrow(/invalid/i);
  });

  it('evaluates a graph-tree OCCS template into cut polygons for nesting', async () => {
    const result = await evaluateOccsCassetteTemplate(createDefaultOccsCassetteTemplateDefinition(), {
      A: 700,
      B: 300,
      R: 40,
      T: 2
    });

    expect(result.dimensions).toMatchObject({ A: 700, B: 300, R: 40, T: 2 });
    expect(result.annotations.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layer: 'dimension.cassette',
        value: expect.objectContaining({ mode: 'measured', value: 700 })
      }),
      expect.objectContaining({
        layer: 'dimension.cassette',
        value: expect.objectContaining({ mode: 'measured', value: 300 })
      })
    ]));
    expect(result.layerData.some(item => item.layer === 'dimension.cassette')).toBe(true);
    expect(result.layerData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layer: 'code.cassette_mark',
        workpieceId: 'wp_1',
        geometry: expect.objectContaining({
          type: 'text',
          text: 'Cassette template\ndraft\nWP 1'
        })
      })
    ]));
    expect(result.nestingPolygons).toHaveLength(1);
    const xs = result.nestingPolygons[0].coordinates.map(point => point[0]);
    const ys = result.nestingPolygons[0].coordinates.map(point => point[1]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 700]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 300]);
  });

  it('bakes sheet workpieces as separate local nesting polygons', async () => {
    const added = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const definition = await createCassetteV2OccsDocument(added.tree);
    const result = await evaluateOccsCassetteTemplate(definition, {
      A: 700,
      B: 300,
      R: 40
    }, {
      templateName: 'Tray A',
      templateId: 'tpl_123'
    });

    expect(result.nestingPolygons).toHaveLength(2);
    expect(result.nestingPolygons.map(polygon => polygon.workpieceId)).toEqual(['wp_1', 'wp_2']);
    expect(result.nestingPolygons.map(polygon => polygon.workpieceDefinitionId)).toEqual(['wp_1_def', 'wp_2_def']);
    expect(result.nestingPolygons.map(polygon => polygon.occurrenceId)).toEqual(['wp_1', 'wp_2']);
    expect(result.nestingPolygons.map(polygon => polygon.handles)).toEqual([['wp_1:C1'], ['wp_2:C1']]);

    for (const polygon of result.nestingPolygons) {
      const xs = polygon.coordinates.map(point => point[0]);
      const ys = polygon.coordinates.map(point => point[1]);
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 700]);
      expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 300]);
    }

    expect(result.layerData).toEqual(expect.arrayContaining([
      expect.objectContaining({ layer: 'cut.outer', workpieceId: 'wp_1' }),
      expect.objectContaining({ layer: 'cut.outer', workpieceId: 'wp_2' }),
      expect.objectContaining({
        layer: 'code.cassette_mark',
        workpieceId: 'wp_1',
        geometry: expect.objectContaining({ text: 'Tray A\ntpl_123\nWP 1' })
      }),
      expect.objectContaining({
        layer: 'code.cassette_mark',
        workpieceId: 'wp_2',
        geometry: expect.objectContaining({ text: 'Tray A\ntpl_123\nWP 2' })
      })
    ]));
  });

  it('excludes non-sheet workpiece definitions from nesting polygons', async () => {
    const added = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const definition = await createCassetteV2OccsDocument(added.tree);
    definition.definitions.workpieces[1].type = 'hardware';

    const result = await evaluateOccsCassetteTemplate(definition, {
      A: 700,
      B: 300,
      R: 40
    });

    expect(result.nestingPolygons).toHaveLength(1);
    expect(result.nestingPolygons[0]).toMatchObject({
      workpieceId: 'wp_1',
      workpieceDefinitionId: 'wp_1_def',
      occurrenceId: 'wp_1'
    });
  });

  it('carries a parametric face sketch into the OCCS face and inner cuts', async () => {
    const sketch = {
      parameters: { W: 120, H: 80, D: 20 },
      shapes: [
        { id: 'outline', type: 'rect', op: 'add', center: ['W/2', 'H/2'], width: 'W', height: 'H' },
        { id: 'hole', type: 'circle', op: 'subtract', center: ['W/2', 'H/2'], diameter: 'D' }
      ]
    };
    const tree = updateCassetteV2FaceSketch(createCassetteV2GraphTree(), 'face_1', sketch);
    const definition = await createCassetteV2OccsDocument(tree);
    const result = await evaluateOccsCassetteTemplate(definition, {});
    const face = definition.definitions.workpieces[0].faces[0];

    expect(face.shape).toMatchObject({ type: 'polygon' });
    expect(face.shape.holes).toHaveLength(1);
    expect(face.extensions.perigram.sketch.parameters).toMatchObject({ W: 120, H: 80, D: 20 });
    expect(result.layerData.filter(item => item.layer === 'cut.inner')).toHaveLength(1);
  });
});
