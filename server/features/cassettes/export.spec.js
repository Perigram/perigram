import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findByIdMock, evaluateTemplateMock, generateSimpleDxfMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
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
vi.mock('./repository.js', () => ({
  findById: findByIdMock,
  find: vi.fn(),
  findDesignByTemplateId: vi.fn(),
  updateById: vi.fn()
}));
vi.mock('../parametric-cassettes/service.js', () => ({
  evaluateTemplate: evaluateTemplateMock,
  generateSimpleDxf: generateSimpleDxfMock
}));
vi.mock('../cassette-designs/service.js', () => ({}));
vi.mock('../entity-revisions/service.js', () => ({}));

import * as cassettesService from './service.js';

describe('cassette template DXF export', () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    evaluateTemplateMock.mockReset();
    generateSimpleDxfMock.mockReset();
  });

  it('exports evaluated OCCS layer data instead of only simple contour polygons', async () => {
    findByIdMock.mockResolvedValue({
      _id: 'template-1',
      identity: { uid: 'template-1', name: 'Template 1' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: { type: 'PARAMETRIC' }
    });
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

    const dxf = await cassettesService.exportDxf('template-1', { A: 100 }, 'user-1', 'org-1', null, null);

    expect(dxf).toContain('cut.outer');
    expect(dxf).toContain('fold.route');
    expect(generateSimpleDxfMock).not.toHaveBeenCalled();
  });
});
