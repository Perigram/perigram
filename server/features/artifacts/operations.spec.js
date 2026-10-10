import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, createRenderedMock, renderTemplateMock, exportersForOrganizationMock, executeConnectorServiceMock, uploadFileMock, getByIdMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  createRenderedMock: vi.fn(),
  renderTemplateMock: vi.fn(),
  exportersForOrganizationMock: vi.fn(),
  executeConnectorServiceMock: vi.fn(),
  uploadFileMock: vi.fn(),
  getByIdMock: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));
vi.mock('./service.js', () => ({ create: createMock, createRendered: createRenderedMock }));
vi.mock('../artifact-templates/service.js', () => ({ render: renderTemplateMock }));
// The export seam resolves from the organization's installed plugins:
// a sheet-design LAYOUT_DXF binding whose executor generates the DXF and
// whose file the platform stores.
vi.mock('../plugins/service.js', () => ({
  exportersForOrganization: exportersForOrganizationMock,
  executeConnectorService: executeConnectorServiceMock
}));
vi.mock('../files/service.js', () => ({ uploadFile: uploadFileMock }));
vi.mock('../instances/service.js', () => ({
  instanceServiceResolver: () => ({ getById: getByIdMock })
}));

import { generateAttachment } from './operations.js';

const EXPORT_BINDING = { typeId: 'sheet-design', kind: 'LAYOUT_DXF', service: 'plugin.facade.generate-sheet-dxf' };

describe('artifact operations', () => {
  beforeEach(() => {
    createMock.mockReset();
    createRenderedMock.mockReset();
    renderTemplateMock.mockReset();
    exportersForOrganizationMock.mockReset().mockResolvedValue([EXPORT_BINDING]);
    executeConnectorServiceMock.mockReset().mockResolvedValue({ dxf: '0\nSECTION\n2\nHEADER\n' });
    uploadFileMock.mockReset().mockResolvedValue({ id: 'file-1' });
    getByIdMock.mockReset().mockResolvedValue({
      _id: 'sheet-1',
      identity: { name: 'Sheet 1', slug: 'sheet-1' },
      data: { geometry: { preview: { layers: [] } } },
      specs: {}
    });
  });

  it('renders a pinned artifact template and stores editable layout provenance', async () => {
    renderTemplateMock.mockResolvedValue({
      buffer: Buffer.from('rendered'),
      format: 'PDF',
      mimeType: 'application/pdf',
      extension: 'pdf',
      layout: { format: 'PDF', pages: [] },
      variables: [{ name: 'projectName', type: 'string' }],
      revisionId: 'template-revision-1'
    });
    createRenderedMock.mockResolvedValue({
      _id: 'artifact-pdf-1',
      data: { type: 'PDF_PASSPORT' },
      attachments: { primary: { fileId: 'file-pdf-1' } }
    });

    const result = await generateAttachment({
      entities: {
        source: {
          _id: 'sheet-3',
          type: 'sheet_design',
          identity: { name: 'Sheet 3' },
          lineage: { organizationId: 'org-1', queueId: 'queue-3' }
        },
        template: { _id: 'template-1', data: { format: 'PDF' } }
      },
      parameters: { kind: 'PDF_PASSPORT', values: { projectName: 'Facade A' } },
      auth: { userId: 'user-1', organizationId: 'org-1', role: 'member' }
    });

    expect(renderTemplateMock).toHaveBeenCalledWith('template-1', { values: { projectName: 'Facade A' } }, expect.any(Object));
    expect(createRenderedMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PDF_PASSPORT',
      layout: { format: 'PDF', pages: [] },
      provenance: expect.objectContaining({
        template: expect.objectContaining({ source: { type: 'artifact_template', id: 'template-1', revisionId: 'template-revision-1' } })
      })
    }), expect.any(Object));
    expect(result.data.completed).toBe(true);
  });

  it('generates and stores a sheet design layout DXF through the plugin export service', async () => {
    createMock.mockResolvedValue({
      _id: 'artifact-1',
      data: { type: 'LAYOUT_DXF' },
      attachments: { primary: { fileId: 'file-1' } }
    });

    const result = await generateAttachment({
      entities: {
        sheetDesign: {
          _id: 'sheet-1',
          identity: { name: 'Sheet 1' },
          lineage: { queueId: 'queue-1' }
        }
      },
      parameters: { kind: 'LAYOUT_DXF' },
      auth: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'member'
      }
    });

    expect(getByIdMock).toHaveBeenCalledWith('sheet-1');
    expect(executeConnectorServiceMock).toHaveBeenCalledWith(
      { id: 'plugin.facade.generate-sheet-dxf' },
      {
        parameters: expect.objectContaining({ typeId: 'sheet-design', id: 'sheet-1' }),
        auth: expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' })
      }
    );
    expect(uploadFileMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LAYOUT_DXF',
      fileId: 'file-1',
      mimeType: 'application/dxf'
    }), 'user-1', 'org-1', 'member', expect.any(Object));
    expect(result.data).toEqual({
      attachmentId: 'artifact-1',
      kind: 'LAYOUT_DXF',
      completed: true
    });
  });

  it('accepts an abstract attachment source entity for layout DXF generation', async () => {
    createMock.mockResolvedValue({
      _id: 'artifact-2',
      data: { type: 'LAYOUT_DXF' },
      attachments: { primary: { fileId: 'file-1' } }
    });

    await generateAttachment({
      entities: {
        source: {
          _id: 'sheet-2',
          type: 'sheet_design',
          identity: { name: 'Sheet 2' },
          lineage: { queueId: 'queue-2' }
        }
      },
      parameters: { kind: 'LAYOUT_DXF' },
      auth: {
        userId: 'user-2',
        organizationId: 'org-2',
        role: 'member'
      }
    });

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      lineage: expect.objectContaining({ sheetDesignId: 'sheet-2' })
    }), 'user-2', 'org-2', 'member', expect.any(Object));
  });

  it('refuses sheet-design DXF export when no plugin binds the export', async () => {
    exportersForOrganizationMock.mockResolvedValue([]);
    await expect(generateAttachment({
      entities: {
        sheetDesign: { _id: 'sheet-9', identity: { name: 'Sheet 9' }, lineage: {} }
      },
      parameters: { kind: 'LAYOUT_DXF' },
      auth: { userId: 'user-1', organizationId: 'org-1', role: 'member' }
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('installed plugin export binding') });
  });
});
