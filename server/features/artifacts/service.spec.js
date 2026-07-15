import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async document => ({ ...document, _id: document.identity.uid }))
}));

vi.mock('./repository.js', () => ({
  create: createMock,
  findById: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn()
}));

import { create } from './service.js';

describe('artifact service', () => {
  beforeEach(() => {
    createMock.mockClear();
  });

  it('creates a valid entity DTO for an uploaded or captured file and preserves its source relation', async () => {
    const artifact = await create({
      name: 'Site capture',
      type: 'UPLOAD',
      organizationId: 'org-1',
      file: {
        id: '507f1f77bcf86cd799439011',
        name: 'capture.jpg',
        mimeType: 'image/jpeg',
        bucketName: 'uploads'
      },
      source: {
        entityType: 'project',
        entityId: 'project-1',
        revisionId: 'revision-3'
      }
    }, 'user-1', 'org-1', 'member', {
      effectivePermissions: { artifacts: [{ level: 'admin' }] }
    });

    expect(artifact).toMatchObject({
      identity: { name: 'Site capture' },
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' }
      },
      relations: {
        source: [{ entityType: 'project', entityId: 'project-1', revisionId: 'revision-3' }]
      },
      attachments: {
        primary: {
          kind: 'UPLOAD',
          name: 'capture.jpg',
          metadata: { mimeType: 'image/jpeg', bucketName: 'uploads' }
        }
      },
      data: { type: 'UPLOAD' }
    });
    expect(artifact._id).toBe(artifact.identity.uid);
    expect(createMock).toHaveBeenCalledOnce();
  });
});
