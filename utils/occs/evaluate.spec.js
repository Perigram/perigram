import { describe, expect, it } from 'vitest';
import { createDefaultOccsCassetteTemplateDefinition } from './templates.js';
import { evaluateOccsCassetteTemplate } from './evaluate.js';
import {
  addCassetteV2Workpiece,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument
} from '../cassetteV2Renderer.js';

describe('OCCS cassette evaluation', () => {
  it('evaluates a graph-tree OCCS template into cut polygons for nesting', async () => {
    const result = await evaluateOccsCassetteTemplate(createDefaultOccsCassetteTemplateDefinition(), {
      A: 700,
      B: 300,
      R: 40
    });

    expect(result.dimensions).toMatchObject({ A: 700, B: 300, R: 40 });
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
    const definition = createCassetteV2OccsDocument(added.tree);
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
    const definition = createCassetteV2OccsDocument(added.tree);
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
});
