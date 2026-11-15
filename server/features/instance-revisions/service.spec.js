import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('./repository.js', () => ({
  ensureIndexes: vi.fn(async () => {}),
  find: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findByHash: vi.fn(async () => null),
  findLatest: vi.fn(async () => null),
  create: vi.fn(async () => null),
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
    repository.ensureIndexes.mockResolvedValue(undefined);
    repository.find.mockResolvedValue([]);
    repository.findById.mockResolvedValue(null);
    repository.findByHash.mockResolvedValue(null);
    repository.findLatest.mockResolvedValue(null);
    repository.create.mockResolvedValue(null);
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

  it('copies top-level source organization ownership into revision lineage', async () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const instanceId = '507f1f77bcf86cd799439011';

    await revisionService.ensureForEntitySnapshot({
      typeId: 'project',
      entity: {
        _id: instanceId,
        organizationId,
        lineage: {},
        name: 'Project'
      },
      content: { fields: { name: 'Project' } }
    });

    const [revision] = repository.create.mock.calls[0];
    expect(revision.lineage.organizationId.toString()).toBe(organizationId);
    expect(revision.lineage.projectId.toString()).toBe(instanceId);
  });

  it('denies direct reads when top-level or origin ownership belongs to another org', async () => {
    for (const revision of [
      { _id: 'rev-1', organizationId: 'org-2', lineage: {} },
      { _id: 'rev-2', origin: { organizationId: 'org-2' }, lineage: {} }
    ]) {
      repository.findById.mockResolvedValueOnce(revision);
      await expect(revisionService.getById(revision._id, 'user-1', null, { organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it('queries all canonical ownership slots but admits only genuinely unowned system revisions', async () => {
    await revisionService.list('user-1', 'org-1', null, { organizationId: 'org-1' });

    const filter = repository.find.mock.calls[0][0];
    expect(filter.$or).toEqual(expect.arrayContaining([
      { 'lineage.organizationId': expect.objectContaining({ $in: expect.any(Array) }) },
      { organizationId: expect.objectContaining({ $in: expect.any(Array) }) },
      { 'origin.organizationId': expect.objectContaining({ $in: expect.any(Array) }) },
      {
        $and: [
          { 'lineage.organizationId': null },
          { organizationId: null },
          { 'origin.organizationId': null }
        ]
      }
    ]));
  });
});
