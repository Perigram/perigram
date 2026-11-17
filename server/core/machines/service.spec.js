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

import { stateService as statusService, appendFieldChangeEvent } from './service.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { recordOrganizationChange } from '~/server/features/instances/index.js';

// The cassette lifecycle exactly as the facade pack declares it (SPEC §7):
// declarations are not a machine source, so the spec environment supplies
// the machine through workflow resolution. The archive transition keeps
// the access contract the authorization tests assert: the system actor
// may archive, humans need the cassettes admin grant.
const cassetteWorkflow = {
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'ACTIVE',
      states: { ACTIVE: {}, ARCHIVED: { terminal: true } },
      transitions: [{
        from: 'ACTIVE',
        to: 'ARCHIVED',
        intent: 'archiveCassette',
        display: 'menu',
        access: {
          system: true,
          permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }]
        }
      }]
    }
  }
};

const mockCassetteWorkflow = () =>
  vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(cassetteWorkflow);

const cassetteDoc = (id, extra = {}) => ({
  type: 'cassette',
  _id: id,
  identity: { uid: id, name: 'Template' },
  lineage: { organizationId: 'org-1' },
  status: { state: 'ACTIVE', userId: 'creator', timestamp: new Date(), metadata: {} },
  ...extra
});

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
    await db.collection('items').deleteMany({});
    await db.collection('files').deleteMany({});
    await db.collection('processes').deleteMany({});
    await db.collection('process_definitions').deleteMany({});
    await db.collection('groups').deleteMany({});
    await db.collection('processes').deleteMany({});
    await db.collection('status_events').deleteMany({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes field audit events through the supplied Mongo transaction session', async () => {
    const session = con.startSession();
    try {
      await session.withTransaction(async () => {
        await appendFieldChangeEvent('part', 'part-1', {
          changes: [{ field: 'width', before: 10, after: 20 }],
          actorId: 'user-1',
          state: 'draft',
          session
        });
        expect(await db.collection('status_events').countDocuments({})).toBe(0);
        expect(await db.collection('status_events').countDocuments({}, { session })).toBe(1);
      });
      expect(await db.collection('status_events').countDocuments({})).toBe(1);
    } finally {
      await session.endSession();
    }
  });

  it('rejects a lifecycle transition when organization data changes during CTS validation', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'ACTIVE',
          states: { ACTIVE: {}, DONE: {} },
          transitions: [{ from: 'ACTIVE', to: 'DONE', access: { system: true } }]
        }
      }
    });
    const instance = {
      _id: 'racing-transition-1',
      type: 'constrained-account',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { code: 'A-1' },
      state: 'ACTIVE',
      lineage: {},
      relations: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('items').insertOne(instance);
    vi.spyOn(getAppRegistry(), 'getInstanceService').mockReturnValue({
      validateCandidate: vi.fn(async () => {
        await recordOrganizationChange('org-1', { kind: 'concurrent-instance-write' });
        return true;
      })
    });

    await expect(statusService.transition(
      'constrained-account',
      instance._id,
      'DONE',
      'SYSTEM',
      { userId: 'SYSTEM', organizationId: 'org-1' }
    )).rejects.toMatchObject({ statusCode: 409, code: 'STALE_ORGANIZATION_READ' });

    const unchanged = await db.collection('items').findOne({ _id: instance._id });
    expect(unchanged.state).toBe('ACTIVE');
    expect(await db.collection('status_events').countDocuments({ targetId: instance._id })).toBe(0);
  });

  it('uses full auth context and registry collection metadata for cassette transitions', async () => {
    mockCassetteWorkflow();
    await db.collection('files').insertOne(cassetteDoc('cassette-1'));

    await statusService.transition('cassette', 'cassette-1', 'ARCHIVED', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });

    const entity = await db.collection('files').findOne({ _id: 'cassette-1' });
    expect(entity.status.state.primary).toBe('ARCHIVED');
    expect(entity.status.state?.primary ?? entity.status.state).toBe('ARCHIVED');
    expect(entity.status.userId).toBe('admin-1');
  });

  it('validates flat CTS state candidates before persisting the status event', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'ACTIVE',
          states: { ACTIVE: {}, DONE: {} },
          transitions: [{ from: 'ACTIVE', to: 'DONE', access: { system: true } }]
        }
      }
    });
    const instance = {
      _id: 'constrained-transition-1',
      type: 'constrained-account',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { code: 'A-1' },
      state: 'ACTIVE',
      lineage: {},
      relations: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('items').insertOne(instance);
    const validateCandidate = vi.fn(async candidate => {
      expect(candidate.state).toBe('DONE');
      throw new Error('permanent constraint failed');
    });
    vi.spyOn(getAppRegistry(), 'getInstanceService').mockReturnValue({ validateCandidate });

    await expect(statusService.transition(
      'constrained-account',
      instance._id,
      'DONE',
      'SYSTEM',
      { userId: 'SYSTEM', role: 'system' }
    )).rejects.toThrow('permanent constraint failed');

    expect(validateCandidate).toHaveBeenCalledTimes(1);
    expect(await db.collection('status_events').countDocuments({ targetId: instance._id })).toBe(0);
    expect((await db.collection('items').findOne({ _id: instance._id })).state).toBe('ACTIVE');
  });

  it('returns only server-authorized actions for the current user', async () => {
    mockCassetteWorkflow();
    await db.collection('files').insertOne(cassetteDoc('cassette-2'));

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

  it('persists lifecycle actors through schema-less states and replaces the set', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'NEW',
          states: { NEW: {}, REVIEW: {}, DONE: {} },
          transitions: [
            { from: 'NEW', to: 'REVIEW', access: { permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }] } },
            { from: 'REVIEW', to: 'DONE', access: { permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }] } }
          ]
        }
      }
    });
    const doc = cassetteDoc('cassette-actors', { status: { state: 'NEW', userId: 'creator', timestamp: new Date(), metadata: {} } });
    await db.collection('files').insertOne(doc);
    const auth = { userId: 'admin-1', memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }] };

    await statusService.transition('cassette', 'cassette-actors', 'REVIEW', 'admin-1', auth, {
      lifecycle: { actors: [{ userId: 'reviewer-1', states: ['DONE'] }] }
    });
    let entity = await db.collection('files').findOne({ _id: 'cassette-actors' });
    expect(entity.status.lifecycle?.actors).toEqual([{ userId: 'reviewer-1', states: ['DONE'] }]);

    // Entry-scoped guard (decided model): the assignee alone may enter
    // DONE; the assignment write replaces the set.
    await expect(statusService.transition('cassette', 'cassette-actors', 'DONE', 'admin-1', auth, {
      lifecycle: { actors: [{ userId: 'qc-1' }] }
    })).rejects.toThrow(/Unauthorized lifecycle actor/);
    await statusService.transition('cassette', 'cassette-actors', 'DONE', 'reviewer-1', {
      userId: 'reviewer-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    }, { lifecycle: { actors: [{ userId: 'qc-1' }] } });
    entity = await db.collection('files').findOne({ _id: 'cassette-actors' });
    expect(entity.status.lifecycle?.actors).toEqual([{ userId: 'qc-1' }]);
  });

  it('hides actor-denied edges from availability and admits the assignee', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'NEW',
          states: { NEW: {}, REVIEW: {}, DONE: {} },
          transitions: [
            { from: 'NEW', to: 'REVIEW', access: { permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }] } },
            { from: 'REVIEW', to: 'DONE', access: { permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }] } }
          ]
        }
      }
    });
    const doc = cassetteDoc('cassette-gated', {
      status: {
        state: 'REVIEW',
        userId: 'creator',
        timestamp: new Date(),
        metadata: {},
        lifecycle: { actors: [{ userId: 'reviewer-1', states: ['DONE'] }], attachments: {}, data: {} }
      }
    });
    await db.collection('files').insertOne(doc);
    const grants = { userId: '$id', memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }] };

    const other = await statusService.getActions('cassette', 'cassette-gated', {
      ...grants, userId: 'admin-1'
    });
    expect(other.actions.map(action => action.to)).toEqual([]);

    const assignee = await statusService.getActions('cassette', 'cassette-gated', {
      ...grants, userId: 'reviewer-1'
    });
    expect(assignee.actions.map(action => action.to)).toEqual(['DONE']);
  });

  it('keeps process-owned edges out of availability while the transition boundary still executes them', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'ACTIVE',
          states: { ACTIVE: {}, ARCHIVED: { terminal: true } },
          transitions: [{ from: 'ACTIVE', to: 'ARCHIVED', processOwned: true }]
        }
      }
    });
    await db.collection('files').insertOne(cassetteDoc('cassette-process-owned'));

    const offered = await statusService.getActions('cassette', 'cassette-process-owned', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });
    expect(offered.actions).toEqual([]);

    await statusService.transition('cassette', 'cassette-process-owned', 'ARCHIVED', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }]
    });
    const entity = await db.collection('files').findOne({ _id: 'cassette-process-owned' });
    expect(entity.status.state.primary).toBe('ARCHIVED');
  });

  it('preflights a named intent without mutating status', async () => {
    mockCassetteWorkflow();
    await db.collection('files').insertOne(cassetteDoc('cassette-intent-preflight'));

    await expect(statusService.assertIntentAvailable(
      'cassette',
      'cassette-intent-preflight',
      'archiveCassette',
      { userId: 'SYSTEM', role: 'SYSTEM', system: true }
    )).resolves.toMatchObject({ from: 'ACTIVE', to: 'ARCHIVED' });

    const cassette = await db.collection('files').findOne({ _id: 'cassette-intent-preflight' });
    expect(cassette.status.state).toBe('ACTIVE');
    expect(await db.collection('status_events').countDocuments({ targetId: 'cassette-intent-preflight' })).toBe(0);
  });

  it('commits an intent transition and entity patch through one transition boundary', async () => {
    mockCassetteWorkflow();
    await db.collection('files').insertOne(cassetteDoc('cassette-intent-patch', { data: { marker: 'before' } }));

    await statusService.transitionWithResult({
      typeId: 'cassette',
      targetId: 'cassette-intent-patch',
      intent: 'archiveCassette',
      auth: { userId: 'SYSTEM', role: 'SYSTEM', system: true },
      patch: { data: { marker: 'after' } }
    });

    const cassette = await db.collection('files').findOne({ _id: 'cassette-intent-patch' });
    expect(cassette.status.state.primary).toBe('ARCHIVED');
    expect(cassette.data.marker).toBe('after');
    expect(await db.collection('status_events').countDocuments({ targetId: 'cassette-intent-patch' })).toBe(1);
  });

  it('rejects combined status/entity writes when Mongo topology rejects transactions', async () => {
    mockCassetteWorkflow();
    await db.collection('files').insertOne(cassetteDoc('cassette-standalone-patch', { data: { marker: 'before' } }));
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
      typeId: 'cassette',
      targetId: 'cassette-standalone-patch',
      intent: 'archiveCassette',
      auth: { userId: 'SYSTEM', role: 'SYSTEM', system: true },
      patch: { data: { marker: 'after' } }
    })).rejects.toThrow('Transaction numbers are only allowed on a replica set member or mongos');

    const cassette = await db.collection('files').findOne({ _id: 'cassette-standalone-patch' });
    expect(standaloneDb.client.startSession).toHaveBeenCalled();
    expect(session.withTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(cassette.status.state).toBe('ACTIVE');
    expect(cassette.data.marker).toBe('before');
    expect(await db.collection('status_events').countDocuments({ targetId: 'cassette-standalone-patch' })).toBe(0);
  });

  it('includes compiled process status actions for the matching entity status', async () => {
    await db.collection('groups').insertOne({
      type: 'project',
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
    await db.collection('groups').insertOne({
      type: 'project',
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
      type: 'queue',
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

  it('refuses initial-state writes when the requested organization does not own the target', async () => {
    const id = new ObjectId();
    await db.collection('groups').insertOne({
      type: 'project',
      _id: id,
      identity: { uid: id.toString(), name: 'Foreign project' },
      lineage: { organizationId: 'org-2' },
      state: 'DRAFT'
    });
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      initial: 'NEW',
      states: { NEW: {} },
      transitions: []
    });

    await expect(statusService.setInitialStateForOrganization(
      'project', id.toString(), 'NEW', 'org-1', { userId: 'system', system: true }
    )).rejects.toMatchObject({ statusCode: 404 });

    const entity = await db.collection('groups').findOne({ _id: id });
    expect(entity.state).toBe('DRAFT');
    expect(await db.collection('status_events').countDocuments({ targetId: id })).toBe(0);
  });

  it('records actor, operation, and evidence first-class on transition events', async () => {
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      revision: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      state: 'new',
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
    expect(entity.state).toBe('active');
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
      state: 'new',
      lineage: { organizationId: 'org-1' }
    });
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue({
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: { new: {}, active: {} },
          transitions: [{ from: 'new', to: 'active', intent: 'activate', access: { system: true } }]
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
      revision: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      state: 'new',
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
    expect(entity.state).toBe('new');
    expect(entity.revision).toBe(2);
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
    await db.collection('groups').insertOne({
      type: 'project',
      _id: id,
      identity: { uid: id, name: 'Project' },
      lineage: { organizationId: 'org-1' },
      state: 'DRAFT'
    });

    await statusService.setInitialStateForOrganization('project', id, 'DELETED', 'org-1', 'operator-1', {
      display: { label: 'Removed' }
    });

    const entity = await db.collection('groups').findOne({ _id: id });
    expect(entity.state).toBe('DELETED');
    const event = await db.collection('status_events').findOne({ targetId: id });
    expect(event.status.metadata.display).toEqual({
      label: 'Removed',
      color: 'danger',
      severity: 'danger',
      icon: 'pi pi-trash'
    });
    expect(event.status.state.active).toEqual({ main: 'DELETED', quality: 'UNVERIFIED' });
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
                  designs: { typeId: 'cassette', lineageKey: 'queueId', required: true }
                }
              }
            }
          },
          transitions: [{ from: 'DRAFT', to: 'SENT', processRoleIds: ['role_operator'] }]
        }
      }
    });

    await db.collection('processes').insertOne({
      type: 'queue',
      _id: queueId,
      identity: { uid: queueId, name: 'Evidence Queue' },
      lineage: { organizationId: 'org-1' },
      state: 'DRAFT'
    });
    await db.collection('files').insertOne({
      type: 'cassette',
      _id: 'cassette-evidence-1',
      identity: { uid: 'cassette-evidence-1', name: 'Cassette 1' },
      lineage: { organizationId: 'org-1', queueId },
      state: 'ACTIVE'
    });

    const auth = {
      userId: 'operator-1',
      roleAssignments: { roleIds: ['role_operator'] },
      memberships: [{
        organizationId: 'org-1',
        permissions: { queues: 'write', files: 'read' }
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

    const entity = await db.collection('processes').findOne({ _id: queueId });
    const event = await db.collection('status_events').findOne({ targetId: queueId });
    const proof = event.status.lifecycle.attachments.proof;
    expect(proof.fileId).toBe(fileId);
    expect(proof.attachmentKey).toMatch(/^status_proof_/);
    expect(entity.attachments[proof.attachmentKey].kind).toBe('mounting-proof');
    expect(event.status.lifecycle.data.snapshots.designs).toMatchObject({
      typeId: 'cassette',
      lineageKey: 'queueId',
      count: 1,
      refs: [{ id: 'cassette-evidence-1', label: 'Cassette 1', status: 'ACTIVE' }]
    });
    expect(entity.state).toBe('SENT');

    workflowSpy.mockRestore();
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
      revision: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { name: 'Note' },
      state: 'new',
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
    expect(entity.state).toBe('new');
    expect(entity.revision).toBe(2);
    expect(entity).not.toHaveProperty('status');
    expect(await db.collection('status_events').countDocuments({ targetId: id })).toBe(1);

    await statusService.transition('e2e-note', id.toString(), 'active', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    });
    entity = await db.collection('items').findOne({ _id: id });
    expect(entity.state).toBe('active');
    expect(entity.revision).toBe(3);
    expect(await db.collection('status_events').countDocuments({ targetId: id })).toBe(2);

    // The read path sees the written state: active -> new is invalid.
    await expect(statusService.transition('e2e-note', id.toString(), 'new', 'admin-1', {
      userId: 'admin-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    })).rejects.toThrow(/Invalid transition from active to new/);
  });

  it('enforces transition guards at commit and hides guard-failing actions', async () => {
    // SPEC §7/§18.3: a guard is a boolean expression AST over { value } —
    // the operated instance's stored row. A guard that no longer holds
    // refuses the transition (409) and the availability list omits the
    // edge entirely.
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: { size: 5 },
      state: 'new',
      lineage: { organizationId: 'org-1' }
    });
    const machine = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: { new: {}, big: {}, small: {} },
          transitions: [
            { from: 'new', to: 'big', guard: { op: 'gte', args: [{ op: 'field', path: ['value', 'size'] }, { op: 'lit', value: 10 }] } },
            { from: 'new', to: 'small', guard: { op: 'lt', args: [{ op: 'field', path: ['value', 'size'] }, { op: 'lit', value: 10 }] } }
          ]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);
    const auth = { userId: 'admin-1', memberships: [{ organizationId: 'org-1', permissions: {} }] };

    const actions = await statusService.getActions('e2e-note', id.toString(), auth);
    expect(actions.actions.map(action => action.to)).toEqual(['small']);

    await expect(statusService.transition('e2e-note', id.toString(), 'big', 'admin-1', auth))
      .rejects.toThrow(/Guard refused transition new -> big/);
    await statusService.transition('e2e-note', id.toString(), 'small', 'admin-1', auth);
    const entity = await db.collection('items').findOne({ _id: id });
    expect(entity.state).toBe('small');
  });

  it('evaluates guards against legacy block rows', async () => {
    // A legacy status-block doc keeps its `data`/`specs` blocks: the guard
    // scope merges them into the same row shape (SPEC §3 seam).
    const machine = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'ACTIVE',
          states: { ACTIVE: {}, ARCHIVED: { terminal: true } },
          transitions: [{
            from: 'ACTIVE',
            to: 'ARCHIVED',
            guard: { op: 'eq', args: [{ op: 'field', path: ['value', 'approved'] }, { op: 'lit', value: true }] }
          }]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);
    const auth = { userId: 'admin-1', memberships: [{ organizationId: 'org-1', permissions: {} }] };
    await db.collection('files').insertOne(cassetteDoc('cassette-g1', { data: { approved: false } }));

    await expect(statusService.transition('cassette', 'cassette-g1', 'ARCHIVED', 'admin-1', auth))
      .rejects.toThrow(/Guard refused/);

    await db.collection('files').updateOne({ _id: 'cassette-g1' }, { $set: { 'data.approved': true } });
    await statusService.transition('cassette', 'cassette-g1', 'ARCHIVED', 'admin-1', auth);
    const doc = await db.collection('files').findOne({ _id: 'cassette-g1' });
    expect(doc.status.state).toMatchObject({ primary: 'ARCHIVED' });
  });

  it('stamps the deadline clock and keeps deadline edges system-only', async () => {
    // SPEC §7: a declared deadline compiles a system-executed edge —
    // availability never offers it and non-system callers are refused —
    // and every flat state write stamps the entered-state clock.
    const id = new ObjectId();
    await db.collection('items').insertOne({
      _id: id,
      type: 'e2e-note',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Note',
      fields: {},
      state: 'new',
      lineage: { organizationId: 'org-1' }
    });
    const machine = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'new',
          states: {
            new: { deadline: { after: 'PT1H', to: 'stale' } },
            stale: {},
            done: {}
          },
          transitions: [
            { from: 'new', to: 'stale', deadline: true, access: { system: true } },
            { from: 'new', to: 'done' }
          ]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);
    const userAuth = { userId: 'admin-1', memberships: [{ organizationId: 'org-1', permissions: {} }] };

    const actions = await statusService.getActions('e2e-note', id.toString(), userAuth);
    expect(actions.actions.map(action => action.to)).toEqual(['done']);

    await expect(statusService.transition('e2e-note', id.toString(), 'stale', 'admin-1', userAuth))
      .rejects.toThrow(/system-only/);

    await statusService.transition('e2e-note', id.toString(), 'stale', 'SYSTEM', {
      userId: 'SYSTEM', system: true, memberships: []
    });
    const entity = await db.collection('items').findOne({ _id: id });
    expect(entity.state).toBe('stale');
    expect(typeof entity.stateChangedAt).toBe('string');
    expect(new Date(entity.stateChangedAt).toString()).not.toBe('Invalid Date');
  });

  it('dispatches hooks whose contracts live in any registered domain', async () => {
    const calls = [];
    getAppRegistry().defineDomain({
      id: 'hooks-spec-domain',
      hooks: {
        recordArchive: { id: 'recordArchive', parameters: [{ name: 'note', required: true }], mode: 'sync' }
      }
    });
    getAppRegistry().registerHookHandler('recordArchive', (context) => {
      calls.push({ targetId: context.targetId, note: context.dryRun ? 'preflight' : 'commit' });
      return [];
    });
    const hookedWorkflow = {
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'ACTIVE',
          states: { ACTIVE: {}, ARCHIVED: { terminal: true } },
          transitions: [{
            from: 'ACTIVE',
            to: 'ARCHIVED',
            intent: 'archiveCassette',
            access: {
              system: true,
              permissions: [{ feature: 'cassettes', typeId: 'cassette', level: 'admin' }]
            },
            hooks: [{ handler: 'recordArchive', phase: 'after', params: { note: 'archived' } }]
          }]
        }
      }
    };
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(hookedWorkflow);
    const auth = { userId: 'admin-1', memberships: [{ organizationId: 'org-1', permissions: { cassettes: 'admin' } }] };

    await db.collection('files').insertOne(cassetteDoc('cassette-hooked'));
    await statusService.transition('cassette', 'cassette-hooked', 'ARCHIVED', 'admin-1', auth);
    const entity = await db.collection('files').findOne({ _id: 'cassette-hooked' });
    expect(entity.status.state.primary).toBe('ARCHIVED');
    // mode: 'sync' rides the domain contract — the handler completes
    // before the transition returns.
    expect(calls.map(call => call.note)).toEqual(['commit']);

    await db.collection('files').insertOne(cassetteDoc('cassette-hooked-bad-params'));
    hookedWorkflow.regions.main.transitions[0].hooks = [
      { handler: 'recordArchive', phase: 'after', params: { note: 'x', stray: true } }
    ];
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(hookedWorkflow);
    await expect(statusService.transition('cassette', 'cassette-hooked-bad-params', 'ARCHIVED', 'admin-1', auth))
      .rejects.toThrow(/unknown parameter stray/);

    await db.collection('files').insertOne(cassetteDoc('cassette-hooked-no-contract'));
    hookedWorkflow.regions.main.transitions[0].hooks = [
      { handler: 'neverDeclaredAnywhere', phase: 'after', params: {} }
    ];
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(hookedWorkflow);
    await expect(statusService.transition('cassette', 'cassette-hooked-no-contract', 'ARCHIVED', 'admin-1', auth))
      .rejects.toThrow(/Hook contract missing for neverDeclaredAnywhere/);
  });
});
