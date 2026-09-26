import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as cassetteService from './service';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

const { workflowMachines } = vi.hoisted(() => {
  // The cassette lifecycle exactly as the facade pack declares it; the
  // revision lifecycle is the documented terminal RECORDED fallback
  // (instance-revisions README). Machines are graph-derived (SPEC §7):
  // the spec environment supplies them through the workflow-resolution
  // seam the machines service consumes.
  const cassetteWorkflow = {
    primaryRegion: 'main',
    regions: {
      main: {
        initial: 'ACTIVE',
        states: { ACTIVE: {}, ARCHIVED: { terminal: true } },
        transitions: [{ from: 'ACTIVE', to: 'ARCHIVED', intent: 'archiveCassette' }]
      }
    }
  };
  const entityRevisionWorkflow = {
    primaryRegion: 'main',
    regions: {
      main: {
        initial: 'RECORDED',
        states: { RECORDED: { terminal: true } },
        transitions: []
      }
    }
  };
  return { workflowMachines: { cassette: cassetteWorkflow, entity_revision: entityRevisionWorkflow } };
});

vi.mock('~/server/features/workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async ({ typeId }) => workflowMachines[typeId] ?? null),
  resolveDefaultWorkflow: vi.fn((typeId) => workflowMachines[typeId] ?? null)
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
    await db.collection('libraries').deleteMany({});
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

  it('always creates a named editable OCCS cassette', async () => {
    const libraryId = new ObjectId();
    await db.collection('libraries').insertOne({
      _id: libraryId,
      identity: { name: 'Default Library', slug: 'default-library' },
      lineage: { organizationId: user1.organizationId }
    });

    const result = await cassetteService.create(
      { identity: { name: 'Generated Template' }, libraryId },
      user1.userId,
      user1.organizationId,
      null,
      user1.permissions
    );

    expect(result.identity.name).toBe('Generated Template');
    expect(result.data.type).toBe('PARAMETRIC');
    expect(result.data.definition.extensions.perigram.graphTree.nodes[0]).toMatchObject({
      id: 'face_1',
      operation: 'face.trapezoid'
    });
    expect(result.data.parameters).toEqual(['A', 'B', 'R', 'T']);
    expect(result.lineage.libraryId.toString()).toBe(libraryId.toString());
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
    const archived = await cassetteService.create({ name: 'Archived Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    const projectScoped = await cassetteService.create({ name: 'Project Template' }, user1.userId, user1.organizationId, null, user1.permissions);
    // The stored shape keeps the status block; the list wire reads the
    // `states` axes projected from `status.state.active`, so both move
    // together (primary for the storage filter, active.main for the wire).
    await db.collection('cassettes').updateOne(
      { _id: archived._id },
      { $set: { 'status.state.primary': 'ARCHIVED', 'status.state.active.main': 'ARCHIVED' } }
    );
    await db.collection('cassettes').updateOne(
      { _id: projectScoped._id },
      { $set: { 'lineage.projectId': 'project-a', 'status.state.primary': 'ARCHIVED', 'status.state.active.main': 'ARCHIVED' } }
    );

    const readOnlyActiveAuth = {
      userId: 'status-reader',
      organizationId: user1.organizationId,
      memberships: [{ organizationId: user1.organizationId, permissions: {} }],
      effectivePermissions: {
        cassettes: [{
          level: 'read',
          rule: { fact: 'primaryState', equals: 'ACTIVE' }
        }]
      }
    };

    const result = await cassetteService.list(
      'status-reader',
      user1.organizationId,
      null,
      readOnlyActiveAuth,
      { primaryStates: 'ACTIVE,ARCHIVED' }
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
      { primaryStates: 'ACTIVE,ARCHIVED', projectId: 'project-a' }
    );
    expect(scoped.map(item => item._id.toString())).toEqual([projectScoped._id.toString()]);
    await expect(cassetteService.getById(
      archived._id.toString(),
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
          rule: { fact: 'primaryState', equals: 'CREATED2' }
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
          rule: { fact: 'primaryState', equals: 'CREATED' }
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

  it('includes thumbnail-capable geometry fields in library cassette previews', async () => {
    const libraryId = new ObjectId();
    await db.collection('libraries').insertOne({
      _id: libraryId,
      identity: { name: 'Preview Library', slug: 'preview-library' },
      lineage: { organizationId: user1.organizationId },
      summary: { cassetteCount: 0 }
    });

    const previewDefinition = createDefaultOccsCassetteTemplateDefinition();
    previewDefinition.parameters = { A: '100', B: '200' };

    const cassette = await cassetteService.create({
      name: 'Preview Cassette',
      libraryId,
      type: 'PARAMETRIC',
      definition: previewDefinition,
      parameters: ['A', 'B']
    }, user1.userId, user1.organizationId, null, user1.permissions);

    await db.collection('cassettes').updateOne(
      { _id: cassette._id },
      {
        $set: {
          'data.geometry': { preview: { viewBox: [0, 0, 100, 200], layers: [] } },
          'data.layerData': [{ layer: 'cut.outer', coordinates: [[0, 0], [100, 0], [100, 200], [0, 200]] }],
          'data.polygonParts': [{ layer: 'cut.outer', points: [[0, 0], [100, 0], [100, 200], [0, 200]] }]
        }
      }
    );

    const previews = await cassetteService.listPreviewByLibraries(
      [libraryId],
      user1.userId,
      user1.organizationId,
      null,
      user1.permissions,
      { limit: 4 }
    );

    expect(previews[libraryId.toString()]).toHaveLength(1);
    expect(previews[libraryId.toString()][0].data).toMatchObject({
      type: 'PARAMETRIC',
      definition: {
        documentType: 'template',
        parameters: { A: '100', B: '200' }
      },
      geometry: {
        preview: { viewBox: [0, 0, 100, 200], layers: [] }
      }
    });
    expect(previews[libraryId.toString()][0].data.layerData).toHaveLength(1);
    expect(previews[libraryId.toString()][0].data.polygonParts).toHaveLength(1);
  });
});
