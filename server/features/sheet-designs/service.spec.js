import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import {
  cassetteDesignsForNestingResult,
  nestingResultForLayout,
  nestingResultToPreview
} from './service.js';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({ connectDB: mockedConnectDB }));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as sheetDesignsService from './service.js';

describe('sheet design nesting preview', () => {
  it('projects worker placed items from source shape data and transformation', () => {
    const preview = nestingResultToPreview({
      items: [
        {
          id: 7,
          shape: {
            type: 'simple_polygon',
            data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
          }
        }
      ],
      solution: {
        layouts: [
          {
            placed_items: [
              {
                item_id: 7,
                transformation: {
                  rotation: 0,
                  translation: [10, 20]
                }
              }
            ]
          }
        ]
      }
    }, { width: 300, height: 200 });

    const cassetteLayer = preview.layers.find(layer => layer.standardCode === 'contour.cassette_face');
    expect(cassetteLayer?.paths).toEqual(['M 10 20 L 110 20 L 110 70 L 10 70 L 10 20 Z']);
  });

  it('projects source OCCS layers onto placed nesting items', () => {
    const preview = nestingResultToPreview({
      items: [
        {
          id: 4,
          shape: {
            type: 'simple_polygon',
            data: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
          },
          sourceLayers: [
            {
              layer: 'cut.outer',
              coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
            },
            {
              layer: 'fold.route',
              coordinates: [[0, 25], [100, 25]]
            },
            {
              layer: 'dimension.cassette',
              geometry: {
                type: 'dimension',
                from: [0, 55],
                to: [100, 55],
                text: 'A'
              }
            },
            {
              layer: 'code.cassette_mark',
              markKind: 'cassette',
              geometry: {
                type: 'text',
                point: [12, 12],
                text: 'Tray A\ntpl_123\nWP 1',
                fontSize: 12,
                textAnchor: 'start',
                dominantBaseline: 'hanging'
              }
            }
          ]
        }
      ],
      solution: {
        layouts: [
          {
            placed_items: [
              {
                item_id: 4,
                transformation: {
                  rotation: 0,
                  translation: [10, 20]
                }
              }
            ]
          }
        ]
      }
    }, { width: 300, height: 200 });

    const sheetLayer = preview.layers.find(layer => layer.standardCode === 'contour.material_sheet');
    const cutLayer = preview.layers.find(layer => layer.standardCode === 'cut.outer');
    const foldLayer = preview.layers.find(layer => layer.standardCode === 'fold.route');
    const dimensionLayer = preview.layers.find(layer => layer.standardCode === 'dimension.cassette');
    const markLayer = preview.layers.find(layer => layer.standardCode === 'code.cassette_mark');

    expect(sheetLayer?.paths).toEqual(['M 0 0 H 300 V 200 H 0 Z']);
    expect(cutLayer?.paths).toEqual(['M 10 20 L 110 20 L 110 70 L 10 70 L 10 20 Z']);
    expect(foldLayer?.paths).toEqual(['M 10 45 L 110 45']);
    expect(dimensionLayer?.paths).toEqual([
      'M 10 75 L 110 75',
      {
        kind: 'text',
        x: 60,
        y: 75,
        text: 'A',
        fill: 'layer',
        fontSize: 12
      }
    ]);
    expect(markLayer?.paths).toEqual([{
      kind: 'text',
      x: 22,
      y: 32,
      text: 'Tray A\ntpl_123\nWP 1',
      fill: 'layer',
      fontSize: 12,
      textAnchor: 'start',
      dominantBaseline: 'hanging',
      markKind: 'cassette'
    }]);
  });

  it('can isolate one physical worker layout for one sheet design preview', () => {
    const result = {
      items: [
        {
          id: 1,
          shape: {
            type: 'simple_polygon',
            data: [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]
          }
        }
      ],
      solution: {
        layouts: [
          {
            placed_items: [
              { item_id: 1, transformation: { rotation: 0, translation: [10, 10] } }
            ]
          },
          {
            placed_items: [
              { item_id: 1, transformation: { rotation: 0, translation: [120, 80] } }
            ]
          }
        ]
      }
    };

    const sheetResult = nestingResultForLayout(result, 1);
    const preview = nestingResultToPreview(result, { width: 300, height: 200 }, { layoutIndex: 1 });
    const cassetteLayer = preview.layers.find(layer => layer.standardCode === 'contour.cassette_face');

    expect(sheetResult.solution.layouts).toEqual([result.solution.layouts[1]]);
    expect(preview.viewBox).toBe('0 0 300 200');
    expect(cassetteLayer?.paths).toEqual(['M 120 80 L 170 80 L 170 130 L 120 130 L 120 80 Z']);
  });

  it('summarizes cassette designs placed on a sheet layout', () => {
    const result = {
      items: [
        { id: 1, cassette_id: 'design-a' },
        { id: 2, cassette_id: 'design-b' }
      ],
      solution: {
        layouts: [{
          placed_items: [
            { item_id: 1 },
            { item_id: 1 },
            { item_id: 2 }
          ]
        }]
      }
    };

    expect(cassetteDesignsForNestingResult(result)).toEqual([
      { cassetteDesignId: 'design-a', count: 2 },
      { cassetteDesignId: 'design-b', count: 1 }
    ]);
  });
});

describe('sheet design access', () => {
  let connection;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    connection = await MongoClient.connect(mongoServer.getUri());
    db = connection.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('sheet_designs').deleteMany({});
  });

  it('uses sheet_designs grants for list and detail access', async () => {
    await db.collection('sheet_designs').insertMany([
      sheetDesign({ id: 'sheet-visible', status: 'CUT' }),
      sheetDesign({ id: 'sheet-hidden', status: 'READY' })
    ]);

    const auth = {
      userId: 'operator',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }],
      effectivePermissions: {
        sheet_designs: [{
          level: 'read',
          rule: { fact: 'primaryStatus', equals: 'CUT' }
        }]
      }
    };

    const listed = await sheetDesignsService.list('operator', 'org-1', null, auth, { queueId: 'queue-1' });

    expect(listed.map(item => item.identity?.uid)).toEqual(['sheet-visible']);
    await expect(sheetDesignsService.getById('sheet-visible', 'operator', 'org-1', null, auth))
      .resolves.toMatchObject({ _id: 'sheet-visible' });
    await expect(sheetDesignsService.getById('sheet-hidden', 'operator', 'org-1', null, auth))
      .rejects.toThrow(/Permission denied/);
  });
});

function sheetDesign({ id, status }) {
  return {
    _id: id,
    identity: { uid: id, name: id, slug: id },
    lineage: { organizationId: 'org-1', queueId: 'queue-1', runId: 'run-1' },
    status: {
      state: {
        schemaVersion: 2,
        primary: status,
        active: { main: status },
        regions: { main: { state: status, path: [status] } }
      }
    },
    data: { geometry: { data: {}, preview: { layers: [] } } },
    summary: {}
  };
}
