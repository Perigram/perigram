import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as cassetteService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Cassette Management & Ownership', () => {
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
    await db.collection('cassettes').deleteMany({});
  });

  const user1 = {
    userId: 'user1',
    organizationId: new ObjectId(),
    permissions: null
  };

  const user2 = {
    userId: 'user2',
    organizationId: new ObjectId(),
    permissions: null
  };

  user1.permissions = {
    memberships: [{ organizationId: user1.organizationId, permissions: { cassettes: 'admin' } }]
  };
  user2.permissions = {
    memberships: [{ organizationId: user2.organizationId, permissions: { cassettes: 'admin' } }]
  };

  it('should create a standard cassette', async () => {
    const data = { name: 'Standard Unit', type: 'STANDARD' };
    const result = await cassetteService.create(data, user1.userId, user1.organizationId, null, user1.permissions);

    expect(result.identity.name).toBe('Standard Unit');
    expect(result.data.type).toBe('STANDARD');
    expect(result).not.toHaveProperty('name');
    expect(result).not.toHaveProperty('type');
    expect(result.lineage.organizationId.toString()).toBe(user1.organizationId.toString());
  });

  it('should create a parametric cassette and extract params', async () => {
    const data = { 
      name: 'Smart Box',
      data: {
        params: { width: 100, height: 200 }
      }
    };
    const result = await cassetteService.create(data, user1.userId, user1.organizationId, null, user1.permissions);

    expect(result.data.type).toBe('PARAMETRIC');
    expect(result.data.definition.params.width).toBe(100);
    expect(result.data.definition.params.height).toBe(200);
  });

  it('creates a named default OCCS cassette template for process construction', async () => {
    const result = await cassetteService.createDefaultOccsTemplate(
      { name: 'Generated Template' },
      user1.userId,
      user1.organizationId,
      null,
      user1.permissions
    );

    expect(result.identity.name).toBe('Generated Template');
    expect(result.data.type).toBe('PARAMETRIC');
    expect(result.data.definition.extensions.cutkit.graphTree.nodes[0]).toMatchObject({
      id: 'face_1',
      operation: 'face.trapezoid'
    });
    expect(result.data.parameters).toEqual(['A', 'B', 'R']);
  });

  it('should update an OCCS cassette definition under the canonical definition field', async () => {
    const cassette = await cassetteService.create({
      name: 'OCCS Template',
      definition: {
        occs: '0.4-draft',
        documentType: 'template',
        parameters: { A: '500' }
      },
      parameters: ['A']
    }, user1.userId, user1.organizationId, null, user1.permissions);

    const updated = await cassetteService.update(cassette._id.toString(), {
      name: 'OCCS Template Updated',
      definition: {
        occs: '0.4-draft',
        documentType: 'template',
        parameters: { A: '700', B: '300' }
      },
      parameters: ['A', 'B']
    }, user1.userId, user1.organizationId, null, user1.permissions);

    expect(updated.identity.name).toBe('OCCS Template Updated');
    expect(updated.data.definition.occs).toBe('0.4-draft');
    expect(updated.data.definition.parameters).toEqual({ A: '700', B: '300' });
    expect(updated.data.parameters).toEqual(['A', 'B']);
    expect(updated.data.occs).toBeUndefined();
  });

  it('rejects design construction from incomplete parametric templates', async () => {
    const cassette = await cassetteService.create({
      name: 'Incomplete Template',
      type: 'PARAMETRIC'
    }, user1.userId, user1.organizationId, null, user1.permissions);

    await expect(cassetteService.createDesignFromTemplate(
      cassette._id.toString(),
      {},
      user1.userId,
      user1.organizationId,
      null,
      user1.permissions,
      { name: 'Design from incomplete template' }
    )).rejects.toThrow(/no construction definition/);
  });

  it('should deny access to cassettes owned by other users', async () => {
    const cassette = await cassetteService.create({ name: 'Private Template' }, user1.userId, user1.organizationId, null, user1.permissions);

    await expect(cassetteService.getById(
      cassette._id.toString(), 
      user2.userId, 
      user2.organizationId, 
      null, 
      user2.permissions
    )).rejects.toThrow(/Permission denied/);
  });

  it('should deny unscoped access without matching membership', async () => {
    const cassette = await cassetteService.create({ name: 'User 1 Template' }, user1.userId, user1.organizationId, null, user1.permissions);

    await expect(cassetteService.getById(
      cassette._id.toString(), 
      'observer-id', 
      null, 
      null, 
      { memberships: [] }
    )).rejects.toThrow(/Permission denied/);
  });

  it('filters cassette lists by generated-screen statuses and detail-equivalent access', async () => {
    const active = await cassetteService.create({ name: 'Active Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    const draft = await cassetteService.create({ name: 'Draft Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    const projectScoped = await cassetteService.create({ name: 'Project Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    await db.collection('cassettes').updateOne(
      { _id: draft._id },
      { $set: { 'status.state.primary': 'DRAFT' } }
    );
    await db.collection('cassettes').updateOne(
      { _id: projectScoped._id },
      { $set: { 'lineage.projectId': 'project-a', 'status.state.primary': 'DRAFT' } }
    );

    const readOnlyActiveAuth = {
      userId: 'status-reader',
      organizationId: user1.organizationId,
      memberships: [{ organizationId: user1.organizationId, permissions: {} }],
      effectivePermissions: {
        cassettes: [{
          level: 'read',
          rule: { fact: 'primaryStatus', equals: 'ACTIVE' }
        }]
      }
    };

    const result = await cassetteService.list(
      'status-reader',
      user1.organizationId,
      null,
      readOnlyActiveAuth,
      { primaryStatuses: 'ACTIVE,DRAFT' }
    );

    expect(result.map(item => item._id.toString())).toEqual([active._id.toString()]);
    const scopedReadAuth = {
      ...readOnlyActiveAuth,
      effectivePermissions: {
        cassettes: [{ level: 'read' }]
      }
    };
    const scoped = await cassetteService.list(
      'status-reader',
      user1.organizationId,
      null,
      scopedReadAuth,
      { primaryStatuses: 'ACTIVE,DRAFT', projectId: 'project-a' }
    );
    expect(scoped.map(item => item._id.toString())).toEqual([projectScoped._id.toString()]);
    await expect(cassetteService.getById(
      draft._id.toString(),
      'status-reader',
      user1.organizationId,
      null,
      readOnlyActiveAuth
    )).rejects.toThrow(/Permission denied/);
  });

  it('allows single cassette reads through status-scoped process grants', async () => {
    const created2 = await cassetteService.create({ name: 'Created2 Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    const active = await cassetteService.create({ name: 'Active Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    await db.collection('cassettes').updateOne(
      { _id: created2._id },
      { $set: { 'status.state.primary': 'CREATED2' } }
    );

    const created2Auth = {
      userId: 'status-reader',
      organizationId: user1.organizationId,
      memberships: [{ organizationId: user1.organizationId, permissions: {} }],
      effectivePermissions: {
        cassettes: [{
          level: 'write',
          rule: { fact: 'primaryStatus', equals: 'CREATED2' }
        }]
      }
    };

    const allowed = await cassetteService.getById(
      created2._id.toString(),
      'status-reader',
      user1.organizationId,
      null,
      created2Auth
    );

    expect(allowed._id.toString()).toBe(created2._id.toString());
    await expect(cassetteService.getById(
      active._id.toString(),
      'status-reader',
      user1.organizationId,
      null,
      created2Auth
    )).rejects.toThrow(/Permission denied/);
  });

  it('allows cassette updates through status-scoped process grants', async () => {
    const created = await cassetteService.create({ name: 'Created Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    const active = await cassetteService.create({ name: 'Active Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    await db.collection('cassettes').updateOne(
      { _id: created._id },
      { $set: { 'status.state.primary': 'CREATED' } }
    );

    const createdAuth = {
      userId: 'status-writer',
      organizationId: user1.organizationId,
      memberships: [{ organizationId: user1.organizationId, permissions: {} }],
      effectivePermissions: {
        cassettes: [{
          level: 'write',
          rule: { fact: 'primaryStatus', equals: 'CREATED' }
        }]
      }
    };

    const updated = await cassetteService.update(
      created._id.toString(),
      { name: 'Updated Template' },
      'status-writer',
      user1.organizationId,
      null,
      createdAuth
    );

    expect(updated.identity.name).toBe('Updated Template');
    await expect(cassetteService.update(
      active._id.toString(),
      { name: 'Denied Template' },
      'status-writer',
      user1.organizationId,
      null,
      createdAuth
    )).rejects.toThrow(/Permission denied/);
  });
});
