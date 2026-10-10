import { beforeEach, describe, expect, it, vi } from 'vitest';

// The conversion machinery is plugin-agnostic: the catalog (declared
// conversions) comes from the organization's installed plugins, and
// entity targets dispatch to the plugin's executor service. These tests
// drive the generic halves with an inline catalog and a mocked connector
// path — no domain imports.
const { createUploadedMock, bucketNameForTypeMock, executeConnectorServiceMock, getFileBufferMock, uploadFileMock, instanceCreateMock } = vi.hoisted(() => ({
  createUploadedMock: vi.fn(),
  bucketNameForTypeMock: vi.fn(),
  executeConnectorServiceMock: vi.fn(),
  getFileBufferMock: vi.fn(),
  uploadFileMock: vi.fn(),
  instanceCreateMock: vi.fn()
}));

vi.mock('../artifacts/service.js', () => ({
  createUploaded: createUploadedMock,
  bucketNameForType: bucketNameForTypeMock
}));
vi.mock('../files/service.js', () => ({ getFileBuffer: getFileBufferMock, uploadFile: uploadFileMock }));
vi.mock('../plugins/service.js', () => ({ executeConnectorService: executeConnectorServiceMock }));
vi.mock('../instances/service.js', () => ({
  instanceServiceResolver: () => ({ create: instanceCreateMock })
}));

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
    service: 'plugin.widgets.import-widget'
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

  it('dispatches entity targets to the plugin executor and creates through the instance machinery', async () => {
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'member' };
    getFileBufferMock.mockResolvedValue(Buffer.from('DXFBYTES'));
    executeConnectorServiceMock.mockResolvedValue({
      payloadBase64: Buffer.from('DXFBYTES').toString('base64'),
      payloadMime: 'application/dxf',
      filename: 'widget.dxf',
      fields: { templateType: 'STANDARD' }
    });
    uploadFileMock.mockResolvedValue({ id: 'file-9' });
    instanceCreateMock.mockResolvedValue({ _id: 'widget-1', type: 'widget' });
    const result = await convertArtifact({
      artifact: {
        _id: 'dxf-1',
        data: { type: 'DXF_SOURCE' },
        identity: { name: 'Source' },
        attachments: { primary: { fileId: 'f-1', name: 'src.dxf' } },
        lineage: { job: 'j-1' }
      },
      conversionId: 'dxfSourceToWidget',
      name: 'Imported widget',
      layerMapping: { CUT: 'cut.outer' }
    }, auth, { conversions });

    expect(executeConnectorServiceMock).toHaveBeenCalledWith(
      { id: 'plugin.widgets.import-widget' },
      {
        parameters: expect.objectContaining({
          artifact: expect.objectContaining({ id: 'dxf-1', type: 'DXF_SOURCE' }),
          name: 'Imported widget',
          layerMapping: { CUT: 'cut.outer' }
        }),
        auth
      }
    );
    expect(uploadFileMock).toHaveBeenCalled();
    expect(instanceCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ identity: { name: 'Imported widget' }, data: { templateType: 'STANDARD' } }),
      'user-1',
      'org-1'
    );
    expect(result).toEqual({ type: 'widget', entity: { _id: 'widget-1', type: 'widget' } });
  });

  it('refuses unknown conversion ids and mismatched source kinds', async () => {
    await expect(convertArtifact({ artifact: { _id: 'a' }, conversionId: 'nope' }, {}, { conversions }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(convertArtifact({
      artifact: { _id: 'a', data: { type: 'PDF_PASSPORT' } },
      conversionId: 'layoutDxfToDxfSource'
    }, {}, { conversions })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses entity conversions without a service binding', async () => {
    const executorless = conversions.map(entry => (
      entry.id === 'dxfSourceToWidget' ? { ...entry, service: undefined } : entry
    ));
    await expect(convertArtifact({
      artifact: { _id: 'a', data: { type: 'DXF_SOURCE' } },
      conversionId: 'dxfSourceToWidget'
    }, {}, { conversions: executorless })).rejects.toMatchObject({ statusCode: 400 });
  });
});
