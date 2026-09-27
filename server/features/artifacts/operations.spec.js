import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, createRenderedMock, sheetDxfExporterMock, renderTemplateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  createRenderedMock: vi.fn(),
  sheetDxfExporterMock: vi.fn(),
  renderTemplateMock: vi.fn()
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

import { generateAttachment } from './operations.js';

describe('artifact operations', () => {
  beforeEach(() => {
    createMock.mockReset();
    createRenderedMock.mockReset();
    renderTemplateMock.mockReset();
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

  it('generates and stores a sheet design layout DXF before creating the artifact', async () => {
    sheetDxfExporterMock.mockResolvedValue({ fileId: 'file-1' });
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
    }, {
      // The pack seam: sheet-design DXF export arrives as the facade
      // pack's injected executor (see server/packs/facade).
      sheetDxfExporter: sheetDxfExporterMock
    });

    expect(sheetDxfExporterMock).toHaveBeenCalledWith('sheet-1', expect.objectContaining({ userId: 'user-1', organizationId: 'org-1', role: 'member' }));
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
    sheetDxfExporterMock.mockResolvedValue({ fileId: 'file-2' });
    createMock.mockResolvedValue({
      _id: 'artifact-2',
      data: { type: 'LAYOUT_DXF' },
      attachments: { primary: { fileId: 'file-2' } }
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
    }, { sheetDxfExporter: sheetDxfExporterMock });

    expect(sheetDxfExporterMock).toHaveBeenCalledWith('sheet-2', expect.objectContaining({ userId: 'user-2', organizationId: 'org-2', role: 'member' }));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      lineage: expect.objectContaining({ sheetDesignId: 'sheet-2' })
    }), 'user-2', 'org-2', 'member', expect.any(Object));
  });
});
