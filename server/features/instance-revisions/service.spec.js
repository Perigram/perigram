import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('./repository.js', () => ({
  ensureIndexes: vi.fn(async () => {}),
  find: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findByHash: vi.fn(async () => null),
  findLatest: vi.fn(async () => null),
  deleteForSource: vi.fn(async () => [])
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async () => null)
}));
vi.mock('../../core/machines/service.js', () => ({
  stateService: { initialStatusForOrganization: vi.fn(async () => null) }
}));

import * as repository from './repository.js';
import * as revisionService from './service.js';

// Revision reads follow their source records' read law: org-scoped rows
// with system rows admitted beside them, cross-org rows refused. The
// stored shape mirrors real entity_revisions documents.
function revisionDoc({ orgId, typeId = 'dxf-source', number = 1 } = {}) {
  const instanceId = new ObjectId();
  return {
    _id: `revision:${typeId}:${instanceId}:geometry:${number}`,
    lineage: {
      ...(orgId ? { organizationId: orgId } : {}),
      [`${typeId}Id`]: instanceId
    },
    attachments: { primary: { fileId: `file-${number}`, name: 'probe.dxf', metadata: { mimeType: 'application/dxf', bucketName: 'files' } } },
    data: {
      source: { type: typeId, id: instanceId.toString() },
      scope: 'geometry',
      number,
      contentHash: `sha256:${number}`,
      createdAt: '2026-10-28T12:00:00.000Z',
      reason: 'created',
      snapshot: null,
      sourceStatus: null
    }
  };
}

const ORG_MEMBER = { organizationId: 'org-1', memberships: [], permissions: {} };

describe('revision read access (source-record visibility law)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists an own-org generic-type revision for a plain org member', async () => {
    repository.find.mockResolvedValue([revisionDoc({ orgId: 'org-1' })]);

    const rows = await revisionService.list('user-1', 'org-1', 'member', ORG_MEMBER, {
      typeId: 'dxf-source',
      instanceId: '6ab12d6d2679cefa9680e7dd',
      scope: 'geometry'
    });

    expect(rows.map(row => row.data.number)).toEqual([1]);
  });

  it('admits system revisions beside own-org rows and refuses cross-org rows', async () => {
    repository.find.mockResolvedValue([
      revisionDoc({ orgId: 'org-1', number: 2 }),
      revisionDoc({ orgId: null, number: 3 }),
      revisionDoc({ orgId: 'org-2', number: 4 })
    ]);

    const rows = await revisionService.list('user-1', 'org-1', 'member', ORG_MEMBER, {});

    expect(rows.map(row => row.data.number).sort()).toEqual([2, 3]);
  });

  it('serves a single revision to same-org and system callers, refuses cross-org', async () => {
    const own = revisionDoc({ orgId: 'org-1' });
    const system = revisionDoc({ orgId: null });
    const foreign = revisionDoc({ orgId: 'org-2' });

    repository.findById.mockImplementation(async id => (
      id === own._id ? own : id === system._id ? system : foreign
    ));

    expect((await revisionService.getById(own._id, 'user-1', 'member', ORG_MEMBER))._id).toBe(own._id);
    expect((await revisionService.getById(system._id, 'user-1', 'member', ORG_MEMBER))._id).toBe(system._id);
    await expect(revisionService.getById(foreign._id, 'user-1', 'member', ORG_MEMBER))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('queries the store with the source filters', async () => {
    repository.find.mockResolvedValue([]);

    await revisionService.list('user-1', 'org-1', 'member', ORG_MEMBER, {
      typeId: 'dxf-source',
      instanceId: '6ab12d6d2679cefa9680e7dd',
      scope: 'geometry'
    });

    const filter = repository.find.mock.calls[0][0];
    expect(filter['data.source.type']).toBe('dxf-source');
    expect(filter['data.source.id']).toBe('6ab12d6d2679cefa9680e7dd');
    expect(filter['data.scope']).toBe('geometry');
  });
});
