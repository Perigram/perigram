import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../server/features/instances/service.js', () => ({
  instanceServiceResolver: vi.fn()
}));
vi.mock('../../../../server/core/access/service.js', () => ({
  hasInstanceAccess: vi.fn(() => true)
}));
vi.mock('../../../../server/features/files/service.js', () => ({
  uploadFile: vi.fn(async () => ({ id: 'file-1' }))
}));
vi.mock('../../../../server/utils/dxf-writer.js', () => ({
  generateLayeredDxf: vi.fn(({ layers = [] }) => (layers.length ? 'DXF-BYTES' : null))
}));

import { instanceServiceResolver } from '../../../../server/features/instances/service.js';
import {
  collapseNestingLayoutsByComposition,
  nestingResultForLayout,
  nestingResultToPreview,
  cassettesForNestingResult,
  updateLayout,
  generateDxf
} from './operations.js';

const AUTH = { userId: 'operator', organizationId: 'org-1', memberships: [] };

describe('sheet design nesting preview', () => {
  it('collapses layouts by cassette composition regardless of placement geometry or order', () => {
    const groups = collapseNestingLayoutsByComposition({
      items: [
        { id: 1, cassette_id: 'design-a' },
        { id: 2, cassette_id: 'design-b' }
      ],
      solution: {
        layouts: [
          { placed_items: [{ item_id: 1, transformation: { translation: [0, 0] } }, { item_id: 2 }] },
          { placed_items: [{ item_id: 2, transformation: { translation: [500, 0] } }, { item_id: 1 }] },
          { placed_items: [{ item_id: 1 }, { item_id: 1 }] }
        ]
      }
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      composition: [
        { cassetteId: 'design-a', count: 1 },
        { cassetteId: 'design-b', count: 1 }
      ],
      sheetCount: 2,
      representativeLayoutIndex: 0,
      layoutIndexes: [0, 1]
    });
    expect(groups[1]).toMatchObject({
      composition: [{ cassetteId: 'design-a', count: 2 }],
      sheetCount: 1,
      representativeLayoutIndex: 2
    });
  });

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

    expect(cassettesForNestingResult(result)).toEqual([
      { cassetteId: 'design-a', count: 2 },
      { cassetteId: 'design-b', count: 1 }
    ]);
  });
});

describe('sheet design operations through the generic instance service', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = {
      getById: vi.fn(),
      patch: vi.fn(async (id, patch) => ({ _id: id, ...patch }))
    };
    instanceServiceResolver.mockReturnValue(service);
  });

  it('saves manual placements as a generic instance patch with recomputed geometry', async () => {
    service.getById.mockResolvedValue({
      _id: 'sheet-1',
      identity: { uid: 'sheet-1', name: 'sheet-1' },
      lineage: { organizationId: 'org-1' },
      data: { geometry: { data: {}, preview: { layers: [] } } }
    });

    const updated = await updateLayout('sheet-1', {
      items: [{
        id: 'manual-1',
        cassette_id: 'cassette-design-1',
        shape: { type: 'simple_polygon', data: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]] }
      }],
      placedItems: [{ item_id: 'manual-1', transformation: { rotation: 0, translation: [25, 30] } }]
    }, AUTH);

    expect(service.patch).toHaveBeenCalledWith('sheet-1', expect.objectContaining({
      data: expect.objectContaining({
        cassetteDesigns: [{ cassetteId: 'cassette-design-1', count: 1 }],
        summary: expect.objectContaining({ placedCount: 1 })
      })
    }), expect.objectContaining({ organizationId: 'org-1' }));
    expect(updated.data.geometry.preview.layers.find(layer => layer.standardCode === 'contour.cassette_face')?.paths)
      .toEqual(['M 25 30 L 45 30 L 45 40 L 25 40 L 25 30 Z']);
  });

  it('exports the layered DXF from the stored preview geometry', async () => {
    service.getById.mockResolvedValue({
      _id: 'sheet-1',
      identity: { uid: 'sheet-1' },
      data: { geometry: { preview: { layers: [{ name: 'cut.outer' }] } } }
    });
    await expect(generateDxf('sheet-1', AUTH)).resolves.toBe('DXF-BYTES');
  });

  it('refuses export when the design has no exportable geometry', async () => {
    service.getById.mockResolvedValue({
      _id: 'sheet-2',
      identity: {},
      data: { geometry: null }
    });
    await expect(generateDxf('sheet-2', AUTH)).rejects.toMatchObject({ statusCode: 404 });
  });
});
