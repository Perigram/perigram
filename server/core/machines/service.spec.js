import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import { statusService } from './service.js';

const transitionAuth = {
  userId: 'operator-1',
  role: 'ContractorAdmin',
  memberships: [{ organizationId: 'org-1', permissions: { projects: 'write' } }],
  permissions: { projects: 'write' }
};

describe('status service lifecycle payloads', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('cassette_instances').deleteMany({});
    await db.collection('cassettes').deleteMany({});
    await db.collection('projects').deleteMany({});
    await db.collection('status_events').deleteMany({});
  });

  it('uses full auth context and registry collection metadata for cassette transitions', async () => {
    await db.collection('cassettes').insertOne({
      _id: 'cassette-1',
      identity: { uid: 'cassette-1', name: 'Template' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.transition('cassetteTemplate', 'cassette-1', 'ARCHIVED', 'admin-1', {
      userId: 'admin-1',
      role: 'ContractorAdmin',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });

    const entity = await db.collection('cassettes').findOne({ _id: 'cassette-1' });
    expect(entity.status.state).toBe('ARCHIVED');
    expect(entity.status.userId).toBe('admin-1');
  });

  it('returns only server-authorized actions for the current user', async () => {
    await db.collection('cassettes').insertOne({
      _id: 'cassette-2',
      identity: { uid: 'cassette-2', name: 'Template' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    const allowed = await statusService.getActions('cassette', 'cassette-2', {
      userId: 'admin-1',
      role: 'ContractorAdmin',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });
    const denied = await statusService.getActions('cassette', 'cassette-2', {
      userId: 'viewer-1',
      role: 'ContractorUser',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'read' } }]
    });

    expect(allowed.actions.map(action => action.to)).toEqual(['ARCHIVED']);
    expect(denied.actions).toEqual([]);
  });

  it('writes metadata and lifecycle to the entity snapshot and status event', async () => {
    const id = new ObjectId();
    const projectId = new ObjectId();
    await db.collection('projects').insertOne({ _id: projectId, identity: { uid: projectId, name: 'Project' } });
    await db.collection('cassette_instances').insertOne({
      _id: id,
      identity: { uid: id, name: 'Cassette 1' },
      lineage: { projectId },
      status: { state: 'PRODUCED', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.transition('cassette_instance', id, 'MILLED', 'operator-1', transitionAuth, {
      metadata: { note: 'Measured after milling' },
      lifecycle: {
        actors: [{ userId: 'mounter-1', capability: 'mounting', states: ['INSTALLED'] }],
        attachments: {
          geometry: { fileId: 'geometry-file', bucketName: 'uploads' },
          photos: [{ fileId: 'photo-file', bucketName: 'uploads' }]
        },
        data: { measuredWidth: 1200 }
      }
    });

    const entity = await db.collection('cassette_instances').findOne({ _id: id });
    expect(entity.status.state).toBe('MILLED');
    expect(entity.status.metadata.note).toBe('Measured after milling');
    expect(entity.status.lifecycle.actors[0].userId).toBe('mounter-1');
    expect(entity.status.lifecycle.attachments.geometry.fileId).toBe('geometry-file');
    expect(entity.status.lifecycle.attachments.photos).toHaveLength(1);
    expect(entity.status.lifecycle.data.measuredWidth).toBe(1200);

    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.status.lifecycle.attachments.geometry.fileId).toBe('geometry-file');
    expect(event.status.metadata.note).toBe('Measured after milling');
  });

  it('keeps metadata-only transitions compatible', async () => {
    const id = new ObjectId();
    const projectId = new ObjectId();
    await db.collection('projects').insertOne({ _id: projectId, identity: { uid: projectId, name: 'Project' } });
    await db.collection('cassette_instances').insertOne({
      _id: id,
      identity: { uid: id, name: 'Cassette 2' },
      lineage: { projectId },
      status: { state: 'PRODUCED', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.transition('cassette_instance', id, 'MILLED', 'operator-1', transitionAuth, {
      note: 'Legacy call shape'
    });

    const entity = await db.collection('cassette_instances').findOne({ _id: id });
    expect(entity.status.metadata.note).toBe('Legacy call shape');
    expect(entity.status.lifecycle).toEqual({ actors: [], attachments: {}, data: {} });
  });

  it('carries current lifecycle facts forward when the target state allows them', async () => {
    const id = new ObjectId();
    const projectId = new ObjectId();
    await db.collection('projects').insertOne({ _id: projectId, identity: { uid: projectId, name: 'Project' } });
    await db.collection('cassette_instances').insertOne({
      _id: id,
      identity: { uid: id, name: 'Cassette 3' },
      lineage: { projectId },
      status: {
        state: 'MILLED',
        userId: 'operator-1',
        timestamp: new Date(),
        metadata: {},
        lifecycle: {
          actors: [{ userId: 'mounter-1', capability: 'mounting', states: ['INSTALLED'] }],
          attachments: { geometry: { fileId: 'geometry-file' } },
          data: { measuredWidth: 1200 }
        }
      }
    });

    await statusService.transition('cassette_instance', id, 'INSTALLED', 'mounter-1', { ...transitionAuth, userId: 'mounter-1' }, {
      note: 'Mounted'
    });

    const entity = await db.collection('cassette_instances').findOne({ _id: id });
    expect(entity.status.lifecycle.attachments.geometry.fileId).toBe('geometry-file');
    expect(entity.status.lifecycle.data.measuredWidth).toBe(1200);
    expect(entity.status.metadata.note).toBe('Mounted');
  });

  it('rejects lifecycle attachment slots not declared for target state', async () => {
    const id = new ObjectId();
    await db.collection('cassette_instances').insertOne({
      _id: id,
      identity: { uid: id, name: 'Cassette 3' },
      status: { state: 'PRODUCED', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await expect(statusService.transition('cassette_instance', id, 'MILLED', 'operator-1', 'OPERATOR', {
      lifecycle: { attachments: { invoice: { fileId: 'invoice-file' } } }
    })).rejects.toThrow(/Invalid lifecycle payload/);
  });
});
