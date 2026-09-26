import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createUploadedMock, bucketNameForTypeMock, importFromArtifactMock, getFileBufferMock } = vi.hoisted(() => ({
  createUploadedMock: vi.fn(),
  bucketNameForTypeMock: vi.fn(),
  importFromArtifactMock: vi.fn(),
  getFileBufferMock: vi.fn()
}));

vi.mock('../artifacts/service.js', () => ({
  createUploaded: createUploadedMock,
  bucketNameForType: bucketNameForTypeMock
}));
vi.mock('../cassettes/service.js', () => ({ importFromArtifact: importFromArtifactMock }));
vi.mock('../files/service.js', () => ({ getFileBuffer: getFileBufferMock }));

import { convertArtifact } from './service.js';

describe('artifact conversion service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies a layout DXF into a typed DXF source artifact with provenance', async () => {
    getFileBufferMock.mockResolvedValue(Buffer.from('dxf'));
    createUploadedMock.mockResolvedValue({ _id: 'converted-1', data: { type: 'DXF_SOURCE' } });
    const result = await convertArtifact({
      artifact: {
        _id: 'layout-1',
        identity: { name: 'Layout' },
        lineage: { organizationId: 'org-1' },
        data: { type: 'LAYOUT_DXF' },
        attachments: { primary: { fileId: 'file-1', name: 'layout.dxf', metadata: { bucketName: 'nestDxf' } } }
      },
      conversionId: 'layoutDxfToDxfSource'
    }, { userId: 'user-1', organizationId: 'org-1' });

    expect(getFileBufferMock).toHaveBeenCalledWith('file-1', 'nestDxf');
    expect(createUploadedMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DXF_SOURCE',
      provenance: expect.objectContaining({ derivedFrom: expect.objectContaining({ source: { type: 'artifact', id: 'layout-1' } }) })
    }), expect.any(Object));
    expect(result).toMatchObject({ type: 'artifact', entity: { _id: 'converted-1' } });
  });

  it('delegates DXF import to the cassette construction service', async () => {
    importFromArtifactMock.mockResolvedValue({ _id: 'cassette-1' });
    const result = await convertArtifact({
      artifact: { _id: 'dxf-1', data: { type: 'DXF_SOURCE' } },
      conversionId: 'dxfSourceToCassette',
      name: 'Imported cassette',
      layerMapping: { CUT: 'cut.outer' }
    }, { userId: 'user-1', organizationId: 'org-1', role: 'member' });

    expect(importFromArtifactMock).toHaveBeenCalledWith(
      'dxf-1', 'Imported cassette', 'user-1', 'org-1', 'member', expect.any(Object), { CUT: 'cut.outer' }, null
    );
    expect(result).toEqual({ type: 'cassette', entity: { _id: 'cassette-1' } });
  });
});
