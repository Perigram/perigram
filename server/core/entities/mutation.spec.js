import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  collection: vi.fn(),
  connectDB: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({ connectDB: mocks.connectDB }));
vi.mock('../../runtime/app-registry.js', () => ({
  getAppRegistry: () => ({
    getEntityDefinition: type => type === 'project'
      ? { type: 'project', collection: 'projects', blocks: ['identity', 'lineage', 'status', 'data', 'relations'] }
      : null
  })
}));
vi.mock('h3', () => ({
  createError: input => Object.assign(new Error(input.message), { statusCode: input.statusCode })
}));

import { mutateEntityFields } from './mutation.js';

describe('entity block mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'project-1' });
    mocks.collection.mockReturnValue({ findOneAndUpdate: mocks.findOneAndUpdate });
    mocks.connectDB.mockResolvedValue({ collection: mocks.collection });
  });

  it('writes only connected fields and normalizes structured reference blocks', async () => {
    await mutateEntityFields('project', 'project-1', ['data.metadata', 'lineage', 'relations.libraries'], {
      data: { metadata: { phase: 'shop' }, ignored: true },
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        project: { entityType: 'project', entityId: 'parent-1', revisionId: 'revision-1' }
      },
      relations: {
        libraries: [{ entityType: 'library', entityId: 'library-1' }],
        ignored: [{ entityType: 'library', entityId: 'library-2' }]
      }
    });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'project-1' },
      { $set: {
        'data.metadata': { phase: 'shop' },
        lineage: {
          organization: { entityType: 'organization', entityId: 'org-1' },
          project: { entityType: 'project', entityId: 'parent-1', revisionId: 'revision-1' }
        },
        'relations.libraries': [{ entityType: 'library', entityId: 'library-1' }]
      } },
      { returnDocument: 'after' }
    );
  });

  it('rejects flat lineage and direct status mutation', async () => {
    await expect(mutateEntityFields('project', 'project-1', ['lineage'], {
      lineage: { projectId: 'project-legacy' }
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(mutateEntityFields('project', 'project-1', ['status'], {
      status: { state: 'CLOSED' }
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
