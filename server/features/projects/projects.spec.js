import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as projectService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Projects & Multi-tenant Ownership', () => {
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
    await db.collection('projects').deleteMany({});
  });

  const contractor1 = {
    userId: 'user1',
    organizationId: new ObjectId(),
    permissions: null
  };

  const contractor2 = {
    userId: 'user2',
    organizationId: new ObjectId(),
    permissions: null
  };

  contractor1.permissions = {
    memberships: [{ organizationId: contractor1.organizationId, permissions: { projects: 'admin' } }]
  };
  contractor2.permissions = {
    memberships: [{ organizationId: contractor2.organizationId, permissions: { projects: 'admin' } }]
  };

  it('should create a project with slug and ownership', async () => {
    const data = { name: 'High-Rise Tower' };
    const result = await projectService.create(
      data, 
      contractor1.userId, 
      contractor1.organizationId, 
      null,
      contractor1.permissions
    );

    const dto = result.toJSON();
    expect(dto.identity.name).toBe('High-Rise Tower');
    expect(dto._id).toMatch(/high-rise-tower-/);
    expect(dto).not.toHaveProperty('id');
    expect(dto).not.toHaveProperty('name');
    expect(result.lineage.organization.entityId.toString()).toBe(contractor1.organizationId.toString());
    expect(result.status.state.primary).toBe('DRAFT');
  });

  it('stores selected libraries as non-owning revision-capable links', async () => {
    const result = await projectService.create({
      name: 'Linked Project',
      libraryIds: [
        'library-1',
        { id: 'library-2', revisionId: 'revision-2' }
      ]
    }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);

    expect(result.relations.libraries).toEqual([
      { entityType: 'library', entityId: 'library-1' },
      { entityType: 'library', entityId: 'library-2', revisionId: 'revision-2' }
    ]);
  });

  it('should isolate project lists between organizations', async () => {
    await projectService.create({ name: 'Org 1 Proj' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    await projectService.create({ name: 'Org 2 Proj' }, contractor2.userId, contractor2.organizationId, null, contractor2.permissions);

    const list1 = await projectService.list(contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    expect(list1).toHaveLength(1);
    expect(list1[0].toJSON().identity.name).toBe('Org 1 Proj');

    const list2 = await projectService.list(contractor2.userId, contractor2.organizationId, null, contractor2.permissions);
    expect(list2).toHaveLength(1);
    expect(list2[0].toJSON().identity.name).toBe('Org 2 Proj');
  });

  it('should deny access to other organization projects', async () => {
    const project = await projectService.create({ name: 'Secret Proj' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);

    await expect(projectService.getBySlug(
      project._id, 
      contractor2.userId, 
      contractor2.organizationId, 
      null, 
      contractor2.permissions
    )).rejects.toThrow(/Permission denied/);
  });

  it('should not expose projects without membership lineage', async () => {
    await projectService.create({ name: 'Org 1 Proj' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    
    const list = await projectService.list('observer', null, null, { memberships: [] });
    expect(list).toHaveLength(0);
  });

  it('should filter project lists through grant rules used by project detail', async () => {
    const visible = await projectService.create({ name: 'Visible Project' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    const hidden = await projectService.create({ name: 'Hidden Project' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    await db.collection('projects').updateOne(
      { _id: hidden._id },
      { $set: { 'status.state': 'CLOSED' } }
    );

    const permissions = {
      memberships: [{
        organizationId: contractor1.organizationId,
        permissions: {
          projects: {
            level: 'read',
            rule: { all: [{ fact: 'status.primary', equals: 'DRAFT' }] }
          }
        }
      }]
    };

    const list = await projectService.list(contractor1.userId, contractor1.organizationId, null, permissions);
    expect(list.map(project => project._id)).toEqual([visible._id]);
    await expect(projectService.getBySlug(hidden._id, contractor1.userId, contractor1.organizationId, null, permissions))
      .rejects.toThrow(/Permission denied/);
  });

  it('should accept multi-status list filters for generated process screens', async () => {
    const draft = await projectService.create({ name: 'Draft Project' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    const closed = await projectService.create({ name: 'Closed Project' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    const archived = await projectService.create({ name: 'Archived Project' }, contractor1.userId, contractor1.organizationId, null, contractor1.permissions);
    await db.collection('projects').updateOne(
      { _id: closed._id },
      { $set: { 'status.state.primary': 'CLOSED' } }
    );
    await db.collection('projects').updateOne(
      { _id: archived._id },
      { $set: { 'status.state.primary': 'ARCHIVED' } }
    );

    const list = await projectService.list(
      contractor1.userId,
      contractor1.organizationId,
      null,
      contractor1.permissions,
      { primaryStatuses: 'DRAFT,CLOSED' }
    );

    expect(list.map(project => project._id).sort()).toEqual([closed._id, draft._id].sort());
  });
});
