import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({ mockedConnectDB: vi.fn() }));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => ({
    getInstanceDefinition: type => (type === 'project' ? { type, collection: 'projects' } : null)
  })
}));

vi.mock('~/server/core/access/service.js', () => ({ assertEntityAccess: vi.fn() }));

vi.mock('~/server/features/process-definitions/runtime.js', () => ({
  resolveProcessWorkflow: vi.fn(async () => null),
  getActiveCompiledProcess: vi.fn(async () => null)
}));

import * as repository from './repository.js';
const { create } = repository;
import { ensureIndexes } from '~/server/db/indexes.js';

const organizationId = '665000000000000000000001';
const auth = {
  userId: 'user-1',
  memberships: [{ organizationId, permissions: { projects: 'admin' } }]
};

const machine = (initial) => ({
  initial,
  states: { [initial]: {}, DONE: {} },
  transitions: [{ from: initial, to: 'DONE' }]
});

describe('workflow override transitions', () => {
  let client;
  let mongoServer;
  let db;
  let collection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongoServer.getUri());
    db = client.db();
    mockedConnectDB.mockResolvedValue(db);
    await db.createCollection('workflow_overrides');
    await ensureIndexes();
    collection = db.collection('workflow_overrides');
  });

  afterAll(async () => {
    await client?.close();
    await mongoServer?.stop();
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  it('enforces one active override per organization and type', async () => {
    const activeIndex = (await collection.indexes()).find(index => index.name === 'org_entity_active_unique');
    expect(activeIndex.unique).toBe(true);
    expect(activeIndex.partialFilterExpression).toEqual({ status: 'ACTIVE' });
  });

  it('activates the first override as ACTIVE', async () => {
    const created = await create({ organizationId, typeId: 'project', workflow: machine('FIRST'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId });

    expect(created.status).toBe('ACTIVE');
    const active = await repository.findActiveByEntity({ organizationId, typeId: 'project' });
    expect(String(active._id)).toBe(String(created._id));
  });

  it('archives the current active override when a replacement activates', async () => {
    const first = await create({ organizationId, typeId: 'project', workflow: machine('FIRST'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId });
    await repository.archiveActive({ organizationId, typeId: 'project', updatedBy: auth.userId });
    const second = await create({ organizationId, typeId: 'project', workflow: machine('SECOND'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId });

    expect(second.status).toBe('ACTIVE');
    const active = await repository.findActiveByEntity({ organizationId, typeId: 'project' });
    expect(String(active._id)).toBe(String(second._id));
    expect(await collection.countDocuments({ status: 'ACTIVE' })).toBe(1);

    const previous = await collection.findOne({ _id: first._id });
    expect(previous.status).toBe('ARCHIVED');
  });

  it('archives an active override through the repository seam', async () => {
    const activeRow = await repository.create({
      organizationId,
      typeId: 'project',
      workflow: machine('ACTIVE'),
      status: 'ACTIVE',
      createdBy: 'user-1'
    });
    const archived = await repository.create({
      organizationId,
      typeId: 'project',
      workflow: machine('OLD'),
      status: 'ARCHIVED',
      createdBy: 'user-1'
    });

    await repository.archiveActive({ organizationId, typeId: 'project', updatedBy: 'user-2' });
    expect((await collection.countDocuments({ status: 'ACTIVE' }))).toBe(0);
    expect((await collection.findOne({ _id: activeRow._id })).status).toBe('ARCHIVED');
    expect((await collection.findOne({ _id: archived._id })).status).toBe('ARCHIVED');
    await expect(repository.findActiveByEntity({ organizationId, typeId: 'project' })).resolves.toBeNull();
  });

  it('keeps one active override through concurrent activation', async () => {
    const results = await Promise.allSettled([
      create({ organizationId, typeId: 'project', workflow: machine('ONE'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId }),
      create({ organizationId, typeId: 'project', workflow: machine('TWO'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId }),
      create({ organizationId, typeId: 'project', workflow: machine('THREE'), status: 'ACTIVE', createdBy: auth.userId, updatedBy: auth.userId })
    ]);

    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    expect(await collection.countDocuments({ status: 'ACTIVE' })).toBe(1);
  });
});
