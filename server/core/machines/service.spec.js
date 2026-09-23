import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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

import { stateService as statusService } from './service.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';

const transitionAuth = {
  userId: 'operator-1',
  memberships: [{ organizationId: 'org-1', permissions: { projects: 'write' } }],
  permissions: { projects: 'write' }
};

describe('status service lifecycle payloads', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockedConnectDB.mockReturnValue(db);
    await db.collection('cassette_instances').deleteMany({});
    await db.collection('cassettes').deleteMany({});
    await db.collection('nesting_runs').deleteMany({});
    await db.collection('process_definitions').deleteMany({});
    await db.collection('projects').deleteMany({});
    await db.collection('queues').deleteMany({});
    await db.collection('status_events').deleteMany({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses full auth context and registry collection metadata for cassette transitions', async () => {
    await db.collection('cassettes').insertOne({
      _id: 'cassette-1',
      identity: { uid: 'cassette-1', name: 'Template' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.transition('cassette', 'cassette-1', 'ARCHIVED', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });

    const entity = await db.collection('cassettes').findOne({ _id: 'cassette-1' });
    expect(entity.status.state.primary).toBe('ARCHIVED');
    expect(entity.status.state?.primary ?? entity.status.state).toBe('ARCHIVED');
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
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });
    const denied = await statusService.getActions('cassette', 'cassette-2', {
      userId: 'viewer-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'read' } }]
    });

    expect(allowed.actions.map(action => action.to)).toEqual(['ARCHIVED']);
    expect(denied.actions).toEqual([]);
  });

  it('preflights a named intent without mutating status', async () => {
    await db.collection('queues').insertOne({
      _id: 'queue-intent-preflight',
      identity: { uid: 'queue-intent-preflight', name: 'Queue' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await expect(statusService.assertIntentAvailable(
      'queue',
      'queue-intent-preflight',
      'completeNestingProduction',
      { userId: 'SYSTEM', role: 'SYSTEM', system: true }
    )).resolves.toMatchObject({ from: 'DRAFT', to: 'READY' });

    const queue = await db.collection('queues').findOne({ _id: 'queue-intent-preflight' });
    expect(queue.status.state).toBe('DRAFT');
    expect(await db.collection('status_events').countDocuments({ targetId: 'queue-intent-preflight' })).toBe(0);
  });

  it('commits an intent transition and entity patch through one transition boundary', async () => {
    await db.collection('queues').insertOne({
      _id: 'queue-intent-patch',
      identity: { uid: 'queue-intent-patch', name: 'Queue' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', userId: 'creator', timestamp: new Date(), metadata: {} },
      data: { marker: 'before' }
    });

    await statusService.transitionWithResult({
      typeId: 'queue',
      targetId: 'queue-intent-patch',
      intent: 'completeNestingProduction',
      auth: { userId: 'SYSTEM', role: 'SYSTEM', system: true },
      patch: { data: { marker: 'after' } }
    });

    const queue = await db.collection('queues').findOne({ _id: 'queue-intent-patch' });
    expect(queue.status.state.primary).toBe('READY');
    expect(queue.data.marker).toBe('after');
    expect(await db.collection('status_events').countDocuments({ targetId: 'queue-intent-patch' })).toBe(1);
  });

  it('rejects combined status/entity writes when Mongo topology rejects transactions', async () => {
    await db.collection('queues').insertOne({
      _id: 'queue-standalone-patch',
      identity: { uid: 'queue-standalone-patch', name: 'Queue' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', userId: 'creator', timestamp: new Date(), metadata: {} },
      data: { marker: 'before' }
    });
    const session = {
      withTransaction: vi.fn(async () => {
        throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
      }),
      endSession: vi.fn()
    };
    const standaloneDb = {
      collection: db.collection.bind(db),
      client: { startSession: vi.fn(() => session) }
    };
    mockedConnectDB.mockReturnValue(standaloneDb);

    await expect(statusService.transitionWithResult({
      typeId: 'queue',
      targetId: 'queue-standalone-patch',
      intent: 'completeNestingProduction',
      auth: { userId: 'SYSTEM', role: 'SYSTEM', system: true },
      patch: { data: { marker: 'after' } }
    })).rejects.toThrow('Transaction numbers are only allowed on a replica set member or mongos');

    const queue = await db.collection('queues').findOne({ _id: 'queue-standalone-patch' });
    expect(standaloneDb.client.startSession).toHaveBeenCalled();
    expect(session.withTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(queue.status.state).toBe('DRAFT');
    expect(queue.data.marker).toBe('before');
    expect(await db.collection('status_events').countDocuments({ targetId: 'queue-standalone-patch' })).toBe(0);
  });

  it('returns archive as a queue menu action from every queue lifecycle state', async () => {
    const states = ['DRAFT', 'NESTING', 'READY', 'CLOSED'];

    for (const state of states) {
      const id = `queue-${state.toLowerCase()}`;
      await db.collection('queues').insertOne({
        _id: id,
        identity: { uid: id, name: `Queue ${state}` },
        lineage: { organizationId: 'org-1' },
        status: { state, userId: 'creator', timestamp: new Date(), metadata: {} }
      });

      const allowed = await statusService.getActions('queue', id, {
        userId: 'operator-1',
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'write' } }]
      });

      expect(allowed.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: 'ARCHIVED', display: 'menu' })
        ])
      );
    }
  });

  it('includes compiled process status actions for the matching entity status', async () => {
    await db.collection('projects').insertOne({
      _id: 'project-process-1',
      identity: { uid: 'project-process-1', name: 'Process Project' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: { primary: 'NEWS', active: { main: 'NEWS' }, regions: { main: { state: 'NEWS', path: ['NEWS'] } } },
        userId: 'creator',
        timestamp: new Date(),
        metadata: {}
      }
    });

    const actions = await statusService.getActions('project', 'project-process-1', {
      userId: 'operator-1',
      memberships: [{ organizationId: 'org-1', permissions: { projects: 'admin' } }],
      roleAssignments: {
        roleIds: ['role_operator'],
        actions: [{
          actionId: 'move_old',
          label: 'Move project OLD',
          actionKind: 'updateEntity',
          typeId: 'project',
          state: { from: 'NEWS', to: 'OLD' }
        }]
      }
    });

    expect(actions.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'NEWS',
        to: 'OLD',
        display: 'menu',
        label: 'Move project OLD'
      })
    ]));
  });

  it('does not expose compiled process status actions that target the current state', async () => {
    await db.collection('projects').insertOne({
      _id: 'project-process-current',
      identity: { uid: 'project-process-current', name: 'Current Project' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: { primary: 'CUT', active: { main: 'CUT' }, regions: { main: { state: 'CUT', path: ['CUT'] } } },
        userId: 'creator',
        timestamp: new Date(),
        metadata: {}
      }
    });

    const actions = await statusService.getActions('project', 'project-process-current', {
      userId: 'operator-1',
      memberships: [{ organizationId: 'org-1', permissions: { projects: 'admin' } }],
      roleAssignments: {
        roleIds: ['role_operator'],
        actions: [{
          actionId: 'mark_cut',
          label: 'Mark cut',
          actionKind: 'updateEntity',
          typeId: 'project',
          status: { to: 'CUT' }
        }]
      }
    });

    expect(actions.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ to: 'CUT' })
    ]));
  });

  it('ignores stale compiled-only process workflows that have no current semantic graph', async () => {
    await db.collection('process_definitions').insertOne({
      _id: 'process-active-transition-role',
      identity: { uid: 'process-active-transition-role', name: 'Process' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: {
          schemaVersion: 2,
          primary: 'ACTIVE',
          active: { main: 'ACTIVE' },
          regions: { main: { state: 'ACTIVE', path: ['ACTIVE'] } }
        }
      },
      data: {
        compiled: {
          workflows: {
            queue: {
              schemaVersion: 2,
              primaryRegion: 'main',
              regions: {
                main: {
                  initial: 'Создано',
                  states: {
                    'Создано': { canUpdateMeta: true },
                    'Отправлено': { canUpdateMeta: true }
                  },
                  transitions: [{
                    from: 'Создано',
                    to: 'Отправлено',
                    processRoleIds: ['role_cutter'],
                    access: {
                      permissions: [{ feature: 'queues', typeId: 'queue', level: 'write' }]
                    }
                  }]
                }
              }
            }
          }
        }
      }
    });
    await db.collection('queues').insertOne({
      _id: 'queue-process-transition-1',
      identity: { uid: 'queue-process-transition-1', name: 'Queue' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: {
          schemaVersion: 2,
          primary: 'Создано',
          active: { main: 'Создано' },
          regions: { main: { state: 'Создано', path: ['Создано'] } }
        },
        userId: 'creator',
        timestamp: new Date(),
        metadata: {}
      }
    });

    const auth = {
      userId: 'operator-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }],
      roleAssignments: {
        roleIds: ['role_cutter'],
        actions: []
      },
      effectivePermissions: {
        queues: [{
          level: 'write',
          transitions: [{ from: 'Создано', to: 'Отправлено' }],
          rule: { fact: 'primaryStatus', equals: 'Отправлено' }
        }]
      }
    };

    const actions = await statusService.getActions('queue', 'queue-process-transition-1', auth);
    expect(actions.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'Создано', to: 'Отправлено' })
    ]));

    await expect(statusService.transitionWithResult({
      typeId: 'queue',
      targetId: 'queue-process-transition-1',
      targetState: 'Отправлено',
      auth
    })).rejects.toThrow();

    const queue = await db.collection('queues').findOne({ _id: 'queue-process-transition-1' });
    expect(queue.status.state.primary).toBe('Создано');
  });

  it('keeps domain system intents available when an active process defines custom statuses', async () => {
    await db.collection('process_definitions').insertOne({
      _id: 'process-active-system-intents',
      identity: { uid: 'process-active-system-intents', name: 'Process' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: {
          schemaVersion: 2,
          primary: 'ACTIVE',
          active: { main: 'ACTIVE' },
          regions: { main: { state: 'ACTIVE', path: ['ACTIVE'] } }
        }
      },
      data: {
        compiled: {
          workflows: {
            nesting_run: {
              schemaVersion: 2,
              primaryRegion: 'main',
              regions: {
                main: {
                  initial: 'CUT',
                  states: {
                    CUT: { canUpdateMeta: true },
                    SENT: { canUpdateMeta: true }
                  },
                  transitions: [
                    { from: 'CUT', to: 'SENT' }
                  ]
                }
              }
            }
          }
        }
      }
    });
    await db.collection('nesting_runs').insertOne({
      _id: 'run-process-system-intents',
      identity: { uid: 'run-process-system-intents', name: 'Run 1' },
      lineage: { organizationId: 'org-1', queueId: 'queue-1' },
      status: {
        state: {
          schemaVersion: 2,
          primary: 'NESTING',
          active: { main: 'NESTING' },
          regions: { main: { state: 'NESTING', path: ['NESTING'] } }
        },
        userId: 'SYSTEM',
        timestamp: new Date(),
        metadata: {}
      }
    });

    await statusService.applyIntent(
      'nesting_run',
      'run-process-system-intents',
      'nestingSolveCompleted',
      { userId: 'SYSTEM', role: 'SYSTEM', system: true }
    );

    const run = await db.collection('nesting_runs').findOne({ _id: 'run-process-system-intents' });
    expect(run.status.state.primary).toBe('COMPLETE');
  });

  it('records actor, operation, and evidence first-class on transition events', async () => {
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      states: { main: 'new' },
      lineage: { organizationId: 'org-1' }
    });
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: {
            new: { canUpdateMeta: true },
            active: {
              canUpdateLifecycle: true,
              lifecycle: {
                data: true,
                attachments: { proof: { kind: 'mounting-proof' } }
              }
            }
          },
          transitions: [{ from: 'new', to: 'active', intent: 'activate' }]
        }
      }
    });

    await statusService.transition('e2e-note', id.toString(), 'active', 'operator-1', {
      userId: 'operator-1',
      name: 'Operator One',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    }, {
      metadata: { note: 'Activated with proof' },
      lifecycle: {
        attachments: { proof: { fileId: 'proof-file', bucketName: 'uploads' } },
        data: { measuredWidth: 1200 }
      }
    });

    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.actor).toEqual({ id: 'operator-1', label: 'Operator One', principalType: 'user' });
    expect(event.operation).toEqual({ kind: 'transition', intent: 'activate', region: 'main' });
    expect(event.evidence.description).toBe('Activated with proof');
    expect(event.evidence.attachments.proof).toMatchObject({
      fileId: 'proof-file',
      bucketName: 'uploads',
      attachmentKey: expect.stringMatching(/^status_proof_/)
    });
    expect(event.evidence.lifecycle.data.measuredWidth).toBe(1200);
    expect(event).not.toHaveProperty('source');

    expect(event.fromState).toBe('new');
    expect(event.toState).toBe('active');
    expect(event.region).toBe('main');
    expect(event.status.userId).toBe('operator-1');
    expect(event.status.metadata.note).toBe('Activated with proof');
    expect(event.status.lifecycle.attachments.proof.fileId).toBe('proof-file');

    const entity = await db.collection('items').findOne({ _id: id });
    expect(entity.states.main).toBe('active');
    expect(entity).not.toHaveProperty('status');
  });

  it('records intent operations and the system actor on intent events', async () => {
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      states: { main: 'new' },
      lineage: { organizationId: 'org-1' }
    });
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: { new: {}, active: {} },
          transitions: [{ from: 'new', to: 'active', intent: 'activate' }]
        }
      }
    });

    await statusService.applyIntent('e2e-note', id.toString(), 'activate', { userId: 'SYSTEM', role: 'SYSTEM', system: true }, {
      note: 'System activated'
    });

    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.actor).toEqual({ id: 'SYSTEM', principalType: 'SYSTEM' });
    expect(event.operation).toEqual({ kind: 'intent', intent: 'activate', region: 'main' });
    expect(event.evidence.description).toBe('System activated');
    expect(event.evidence.lifecycle).toEqual({ actors: [], attachments: {}, data: {} });
    expect(event.toState).toBe('active');
  });

  it('records actor, initialize operation, and source on initial-state events', async () => {
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      states: { main: 'new' },
      lineage: { organizationId: 'org-1' }
    });
    const machine = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: { new: {}, active: {} },
          transitions: [{ from: 'new', to: 'active' }]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);

    await statusService.setInitialStateForOrganization('e2e-note', id.toString(), 'new', 'org-1', { userId: 'admin-1', name: 'Admin One' }, {
      note: 'Seeded by process',
      source: { kind: 'process-run', actionId: 'create_a' }
    });

    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.fromState).toBeNull();
    expect(event.toState).toBe('new');
    expect(event.actor).toEqual({ id: 'admin-1', label: 'Admin One', principalType: 'user' });
    expect(event.operation).toEqual({ kind: 'initialize', region: 'main' });
    expect(event.evidence.description).toBe('Seeded by process');
    expect(event.evidence.lifecycle).toEqual({ actors: [], attachments: {}, data: {} });
    expect(event.source).toEqual({ kind: 'process-run', actionId: 'create_a' });
    expect(event.status.metadata.note).toBe('Seeded by process');
    expect(event.status.metadata).not.toHaveProperty('source');

    const entity = await db.collection('items').findOne({ _id: id });
    expect(entity.states.main).toBe('new');
    expect(entity).not.toHaveProperty('status');
  });

  it('returns no actions for entity types without workflows', async () => {
    const actions = await statusService.getActions('warehouse', 'warehouse-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: { warehouses: 'admin' } }]
    });

    expect(actions).toEqual({
      typeId: 'warehouse',
      targetId: 'warehouse-1',
      state: null,
      actions: []
    });
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
    expect(entity.status.state.primary).toBe('MILLED');
    expect(entity.status.state?.primary ?? entity.status.state).toBe('MILLED');
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

  it('strips producer output provenance from persisted entity status metadata', async () => {
    const id = new ObjectId();
    const projectId = new ObjectId();
    await db.collection('projects').insertOne({ _id: projectId, identity: { uid: projectId, name: 'Project' } });
    await db.collection('cassette_instances').insertOne({
      _id: id,
      identity: { uid: id, name: 'Cassette 3' },
      lineage: { projectId },
      status: { state: 'PRODUCED', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.transition('cassette_instance', id, 'MILLED', 'operator-1', transitionAuth, {
      producerOutputId: 'create_cassette:entity',
      metadata: { note: 'Milled on line 2', producerOutputId: 'create_cassette:entity' }
    });

    const entity = await db.collection('cassette_instances').findOne({ _id: id });
    expect(entity.status.state.primary).toBe('MILLED');
    expect(entity.status.metadata.note).toBe('Milled on line 2');
    expect(entity.status.metadata).not.toHaveProperty('producerOutputId');

    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.status.metadata.note).toBe('Milled on line 2');
    expect(event.status.metadata).not.toHaveProperty('producerOutputId');
  });

  it('fills status display metadata from the active workflow state', async () => {
    const id = new ObjectId();
    const workflowSpy = vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'DRAFT',
          states: {
            DRAFT: { canUpdateMeta: true },
            DELETED: {
              label: 'Deleted',
              severity: 'danger',
              color: 'danger',
              icon: 'pi pi-trash',
              canUpdateMeta: true
            }
          },
          transitions: []
        },
        quality: {
          initial: 'UNVERIFIED',
          states: { UNVERIFIED: {}, VERIFIED: {} },
          transitions: []
        }
      }
    });
    await db.collection('projects').insertOne({
      _id: id,
      identity: { uid: id, name: 'Project' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    await statusService.setInitialStateForOrganization('project', id, 'DELETED', 'org-1', 'operator-1', {
      display: { label: 'Removed' }
    });

    const entity = await db.collection('projects').findOne({ _id: id });
    expect(entity.status.metadata.display).toEqual({
      label: 'Removed',
      color: 'danger',
      severity: 'danger',
      icon: 'pi pi-trash'
    });
    expect(entity.status.state.active).toEqual({ main: 'DELETED', quality: 'UNVERIFIED' });
    workflowSpy.mockRestore();
  });

  it('captures status evidence attachments and declared relation snapshots', async () => {
    const queueId = 'queue-evidence';
    const fileId = new ObjectId().toString();
    const workflowSpy = vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'DRAFT',
          states: {
            DRAFT: { canUpdateMeta: true },
            SENT: {
              canUpdateLifecycle: true,
              lifecycle: {
                description: { required: true },
                attachments: {
                  proof: { required: true, multiple: false, kind: 'mounting-proof' }
                },
                snapshots: {
                  designs: { typeId: 'cassette_design', lineageKey: 'queueId', required: true }
                }
              }
            }
          },
          transitions: [{ from: 'DRAFT', to: 'SENT', processRoleIds: ['role_operator'] }]
        }
      }
    });

    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Evidence Queue' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', userId: 'creator', timestamp: new Date(), metadata: {} }
    });
    await db.collection('cassette_designs').insertOne({
      _id: 'design-1',
      identity: { uid: 'design-1', name: 'Design 1' },
      lineage: { organizationId: 'org-1', queueId },
      status: { state: 'READY', userId: 'creator', timestamp: new Date(), metadata: {} }
    });

    const auth = {
      userId: 'operator-1',
      roleAssignments: { roleIds: ['role_operator'] },
      memberships: [{
        organizationId: 'org-1',
        permissions: { queues: 'write', cassette_designs: 'read' }
      }]
    };

    const actions = await statusService.getActions('queue', queueId, auth);
    expect(actions.actions[0].lifecycle.attachments.proof.required).toBe(true);

    await expect(statusService.transition('queue', queueId, 'SENT', 'operator-1', auth, {
      lifecycle: { attachments: { proof: { fileId, name: 'proof.jpg' } } }
    })).rejects.toThrow(/Status description is required/);

    await statusService.transition('queue', queueId, 'SENT', 'operator-1', auth, {
      metadata: { note: 'Mounted with photo proof' },
      lifecycle: {
        attachments: { proof: { fileId, name: 'proof.jpg', bucketName: 'uploads' } }
      }
    });

    const entity = await db.collection('queues').findOne({ _id: queueId });
    const proof = entity.status.lifecycle.attachments.proof;
    expect(proof.fileId).toBe(fileId);
    expect(proof.attachmentKey).toMatch(/^status_proof_/);
    expect(entity.attachments[proof.attachmentKey].kind).toBe('mounting-proof');
    expect(entity.status.lifecycle.data.snapshots.designs).toMatchObject({
      typeId: 'cassette_design',
      lineageKey: 'queueId',
      count: 1,
      refs: [{ id: 'design-1', label: 'Design 1', status: 'READY' }]
    });

    const event = await db.collection('status_events').findOne({ targetId: queueId });
    expect(event.status.lifecycle.attachments.proof.attachmentKey).toBe(proof.attachmentKey);
    expect(event.status.lifecycle.data.snapshots.designs.count).toBe(1);

    workflowSpy.mockRestore();
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

  it('reads and writes lifecycle state on CTS-native instance documents', async () => {
    // Org-authored types never enter the static registry: the status
    // engine resolves their per-class collection per call and moves
    // states.main — never a legacy status block.
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      states: { main: 'new' },
      lineage: { organizationId: 'org-1' }
    });
    const machine = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: { new: {}, active: {} },
          transitions: [{ from: 'new', to: 'active' }]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);

    await statusService.setInitialStateForOrganization('e2e-note', id.toString(), 'new', 'org-1', 'admin-1', {});
    let entity = await db.collection('items').findOne({ _id: id });
    expect(entity.states.main).toBe('new');
    expect(entity).not.toHaveProperty('status');
    expect(await db.collection('status_events').countDocuments({ targetId: id })).toBe(1);

    await statusService.transition('e2e-note', id.toString(), 'active', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    });
    entity = await db.collection('items').findOne({ _id: id });
    expect(entity.states.main).toBe('active');
    expect(await db.collection('status_events').countDocuments({ targetId: id })).toBe(2);

    // The read path sees the written state: active -> new is invalid.
    await expect(statusService.transition('e2e-note', id.toString(), 'new', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    })).rejects.toThrow(/Invalid transition from active to new/);
  });
});
