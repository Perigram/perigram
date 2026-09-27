import { beforeEach, describe, expect, it, vi } from 'vitest';

// The conversion machinery is pack-agnostic: the catalog (declared
// conversions and entity-target executors) is injected by the mounted
// pack's command-handler override (see server/packs/facade). These tests
// drive the generic halves with an inline catalog — no domain imports.
const { createUploadedMock, bucketNameForTypeMock, entityRunMock, getFileBufferMock } = vi.hoisted(() => ({
  createUploadedMock: vi.fn(),
  bucketNameForTypeMock: vi.fn(),
  entityRunMock: vi.fn(),
  getFileBufferMock: vi.fn()
}));

vi.mock('../artifacts/service.js', () => ({
  createUploaded: createUploadedMock,
  bucketNameForType: bucketNameForTypeMock
}));
vi.mock('../files/service.js', () => ({ getFileBuffer: getFileBufferMock }));

import { convertArtifact } from './service.js';

const conversions = [
  {
    id: 'layoutDxfToDxfSource',
    label: 'Create DXF source',
    sourceKinds: ['LAYOUT_DXF'],
    target: { kind: 'artifact', artifactKind: 'DXF_SOURCE' }
  },
  {
    id: 'dxfSourceToWidget',
    label: 'Import widget',
    sourceKinds: ['DXF_SOURCE'],
    target: { kind: 'entity', typeId: 'widget' },
    run: entityRunMock
  }
];

describe('artifact conversion service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies a source artifact into the declared target kind with provenance', async () => {
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
    }, { userId: 'user-1', organizationId: 'org-1' }, { conversions });

    expect(getFileBufferMock).toHaveBeenCalledWith('file-1', 'nestDxf');
    expect(createUploadedMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DXF_SOURCE',
      provenance: expect.objectContaining({ derivedFrom: expect.objectContaining({ source: { type: 'artifact', id: 'layout-1' } }) })
    }), expect.any(Object));
    expect(result).toMatchObject({ type: 'artifact', entity: { _id: 'converted-1' } });
  });

  it('delegates entity targets to the pack-registered executor with the conversion inputs', async () => {
    entityRunMock.mockResolvedValue({ type: 'widget', entity: { _id: 'widget-1' } });
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'member' };
    const result = await convertArtifact({
      artifact: { _id: 'dxf-1', data: { type: 'DXF_SOURCE' } },
      conversionId: 'dxfSourceToWidget',
      name: 'Imported widget',
      layerMapping: { CUT: 'cut.outer' }
    }, auth, { conversions });

    expect(entityRunMock).toHaveBeenCalledWith({
      artifact: { _id: 'dxf-1', data: { type: 'DXF_SOURCE' } },
      name: 'Imported widget',
      layerMapping: { CUT: 'cut.outer' },
      parameters: undefined
    }, auth);
    expect(result).toEqual({ type: 'widget', entity: { _id: 'widget-1' } });
  });

  it('refuses unknown conversion ids and mismatched source kinds', async () => {
    await expect(convertArtifact({ artifact: { _id: 'a' }, conversionId: 'nope' }, {}, { conversions }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(convertArtifact({
      artifact: { _id: 'a', data: { type: 'PDF_PASSPORT' } },
      conversionId: 'layoutDxfToDxfSource'
    }, {}, { conversions })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses entity conversions whose pack executor is not mounted', async () => {
    const executorless = conversions.map(entry => (
      entry.id === 'dxfSourceToWidget' ? { ...entry, run: undefined } : entry
    ));
    await expect(convertArtifact({
      artifact: { _id: 'a', data: { type: 'DXF_SOURCE' } },
      conversionId: 'dxfSourceToWidget'
    }, {}, { conversions: executorless })).rejects.toMatchObject({ statusCode: 400 });
  });
});
