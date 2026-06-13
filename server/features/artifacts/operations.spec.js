import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, generateAndStoreDxfMock, findLatestByRunMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  generateAndStoreDxfMock: vi.fn(),
  findLatestByRunMock: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));
vi.mock('./service.js', () => ({ create: createMock }));
vi.mock('../sheet-designs/service.js', () => ({ generateAndStoreDxf: generateAndStoreDxfMock }));
vi.mock('../nesting/jobs.js', () => ({ findLatestByRun: findLatestByRunMock }));

import { generateAttachment } from './operations.js';

describe('artifact operations', () => {
  beforeEach(() => {
    createMock.mockReset();
    generateAndStoreDxfMock.mockReset();
    findLatestByRunMock.mockReset();
  });

  it('generates and stores a sheet design layout DXF before creating the artifact', async () => {
    generateAndStoreDxfMock.mockResolvedValue({ fileId: 'file-1' });
    createMock.mockResolvedValue({
      _id: 'artifact-1',
      data: { type: 'LAYOUT_DXF' },
      status: { state: 'READY' }
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

    expect(generateAndStoreDxfMock).toHaveBeenCalledWith('sheet-1', 'user-1', 'org-1', 'member', expect.any(Object));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LAYOUT_DXF',
      status: 'READY',
      fileId: 'file-1',
      mimeType: 'application/dxf'
    }), 'user-1');
    expect(result.data).toEqual({
      attachmentId: 'artifact-1',
      kind: 'LAYOUT_DXF',
      status: 'READY'
    });
  });
});
