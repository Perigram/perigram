import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolverMock, evaluateTemplateMock, generateSimpleDxfMock } = vi.hoisted(() => ({
  resolverMock: vi.fn(),
  evaluateTemplateMock: vi.fn(),
  generateSimpleDxfMock: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));
vi.mock('#services/features/instances/service.js', () => ({
  instanceServiceResolver: resolverMock
}));
vi.mock('./evaluation.js', () => ({
  evaluateTemplate: evaluateTemplateMock,
  generateSimpleDxf: generateSimpleDxfMock
}));

import * as cassettesService from './service.js';

function serviceOf(dto) {
  return { getById: vi.fn(async () => dto) };
}

describe('cassette template DXF export', () => {
  beforeEach(() => {
    evaluateTemplateMock.mockReset();
    generateSimpleDxfMock.mockReset();
  });

  it('exports evaluated OCCS layer data instead of only simple contour polygons', async () => {
    resolverMock.mockReturnValue(serviceOf({
      _id: 'template-1',
      identity: { uid: 'template-1', name: 'Template 1' },
      data: { templateType: 'PARAMETRIC' }
    }));
    evaluateTemplateMock.mockResolvedValue({
      polygons: [{ coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] }],
      nestingPolygons: [{ coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] }],
      layerData: [
        {
          layer: 'cut.outer',
          coordinates: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]
        },
        {
          layer: 'fold.route',
          coordinates: [[0, 25], [100, 25]]
        }
      ]
    });
    generateSimpleDxfMock.mockReturnValue('simple contour only');

    const dxf = await cassettesService.exportDxf('template-1', { A: 100 }, {});

    expect(dxf).toContain('cut.outer');
    expect(dxf).toContain('fold.route');
    expect(generateSimpleDxfMock).not.toHaveBeenCalled();
  });

  it('exports a STANDARD template from its stored layers', async () => {
    resolverMock.mockReturnValue(serviceOf({
      _id: 'template-2',
      identity: { uid: 'template-2', name: 'Standard' },
      data: {
        templateType: 'STANDARD',
        layerData: [{ layer: 'cut.outer', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }],
        polygonParts: []
      }
    }));

    const dxf = await cassettesService.exportDxf('template-2', {}, {});
    expect(dxf).toContain('cut.outer');
    expect(evaluateTemplateMock).not.toHaveBeenCalled();
  });
});
