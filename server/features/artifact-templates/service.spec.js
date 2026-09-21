import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  ensureRevision: vi.fn(),
  parseTemplate: vi.fn(),
  normalizeLayout: vi.fn(),
  templateVariables: vi.fn(),
  initialStatus: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((input) => Object.assign(new Error(input.message), { statusCode: input.statusCode }))
}));
vi.mock('./repository.js', () => ({
  create: mocks.create,
  findById: mocks.findById,
  find: vi.fn(),
  updateById: mocks.updateById,
  deleteById: mocks.deleteById
}));
vi.mock('../files/service.js', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile
}));
vi.mock('../entity-revisions/service.js', () => ({
  ensureForEntitySnapshot: mocks.ensureRevision
}));
vi.mock('../../core/access/service.js', () => ({
  assertEntityAccess: vi.fn(),
  hasEntityAccess: vi.fn(() => true)
}));
vi.mock('../../utils/permissions.js', () => ({ getLineageFilter: vi.fn(() => ({})) }));
vi.mock('../_template/process-update-handler.js', () => ({
  createProcessUpdateHandler: vi.fn(() => vi.fn())
}));
vi.mock('./format.js', () => ({
  templateFormatFor: vi.fn(() => 'PDF'),
  parseTemplate: mocks.parseTemplate,
  normalizeTemplateLayout: mocks.normalizeLayout,
  templateVariables: mocks.templateVariables,
  renderTemplate: vi.fn()
}));
vi.mock('../../core/machines/service.js', () => ({
  statusService: { initialStatusForOrganization: mocks.initialStatus }
}));

import { createUploaded, replaceLayout } from './service.js';

const FILE_ID = '507f1f77bcf86cd799439011';

function template(overrides = {}) {
  return {
    _id: 'template-1',
    identity: { uid: 'template-1', name: 'Passport' },
    origin: { state: 'ACTIVE' },
    status: { state: 'ACTIVE' },
    lineage: { organizationId: 'org-1' },
    relations: {},
    provenance: {},
    attachments: {},
    data: { format: 'PDF', layout: { format: 'PDF', pages: [] }, variables: [], revisions: {} },
    ...overrides
  };
}

describe('artifact template service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseTemplate.mockResolvedValue({ format: 'PDF', pages: [] });
    mocks.normalizeLayout.mockImplementation(value => value);
    mocks.templateVariables.mockReturnValue([]);
    mocks.uploadFile.mockResolvedValue({ id: FILE_ID, filename: 'passport.pdf' });
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.deleteById.mockResolvedValue({ deletedCount: 1 });
    mocks.initialStatus.mockResolvedValue({ state: 'ACTIVE' });
    mocks.create.mockImplementation(async value => template({ ...value, _id: 'template-1' }));
    mocks.ensureRevision.mockResolvedValue({
      _id: 'revision-1',
      data: { number: 1, contentHash: 'sha256:layout' }
    });
    mocks.updateById.mockImplementation(async (id, patch) => template({
      attachments: { source: { fileId: FILE_ID } },
      data: { format: 'PDF', layout: patch['data.layout'] || { format: 'PDF', pages: [] }, activeRevisionId: patch['data.activeRevisionId'] }
    }));
  });

  it('stores the source, creates the entity, and pins its initial layout revision', async () => {
    const result = await createUploaded({
      buffer: Buffer.from('%PDF'),
      filename: 'passport.pdf',
      mimeType: 'application/pdf',
      name: 'Passport'
    }, { userId: 'user-1', organizationId: 'org-1' });

    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      lineage: { organizationId: 'org-1' },
      attachments: { source: expect.objectContaining({ fileId: expect.anything() }) },
      data: expect.objectContaining({ format: 'PDF', activeRevisionId: null })
    }));
    expect(mocks.ensureRevision).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'artifact_template',
      scope: 'layout',
      userId: 'user-1'
    }));
    expect(mocks.updateById).toHaveBeenCalledWith('template-1', expect.objectContaining({
      'data.activeRevisionId': 'revision-1'
    }));
    expect(result.data.activeRevisionId).toBe('revision-1');
  });

  it('persists the immutable revision before switching the active layout pointer', async () => {
    mocks.findById.mockResolvedValue(template());
    const nextLayout = { format: 'PDF', pages: [{ number: 1, items: [] }] };

    await replaceLayout('template-1', nextLayout, {
      userId: 'user-1', organizationId: 'org-1'
    });

    expect(mocks.ensureRevision).toHaveBeenCalledWith(expect.objectContaining({
      content: { layout: nextLayout },
      reason: 'template-layout-updated'
    }));
    expect(mocks.ensureRevision.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.updateById.mock.invocationCallOrder[0]);
    expect(mocks.updateById).toHaveBeenCalledWith('template-1', expect.objectContaining({
      'data.layout': nextLayout,
      'data.activeRevisionId': 'revision-1'
    }));
  });

  it('removes both partial entity state and the uploaded blob if revision creation fails', async () => {
    mocks.ensureRevision.mockRejectedValueOnce(new Error('revision failed'));
    mocks.deleteById.mockResolvedValue({ deletedCount: 1 });

    await expect(createUploaded({
      buffer: Buffer.from('%PDF'),
      filename: 'passport.pdf',
      mimeType: 'application/pdf'
    }, { userId: 'user-1', organizationId: 'org-1' })).rejects.toThrow('revision failed');

    expect(mocks.deleteById).toHaveBeenCalledWith('template-1');
    expect(mocks.deleteFile).toHaveBeenCalledWith(FILE_ID, 'artifactTemplates');
  });
});
