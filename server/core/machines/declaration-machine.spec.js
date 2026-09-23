import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

// Declaration-derived machines (SPEC §7/§13): an org-authored type whose
// lifecycle lives on its declaration — no domain workflow, no override,
// no process machine — still executes. This spec proves the whole chain
// end to end against a real Mongo: the stored `cts_types` declaration,
// the per-class instance document (§3 stored shape, `states.main`), the
// actions endpoint's machine, and the transition write (status event +
// states.main snapshot).
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

import { stateService } from './service.js';

const ORG = 'org-decl-1';
const OTHER_ORG = 'org-decl-2';
const TYPE_ID = 't-uth93vgdab';

// The user's case as a stored declaration: GOO (initial) + CHANGED
// (terminal), one declared transition — the shape a tree + transition
// node apply posts.
function storedDeclaration(organizationId) {
  return {
    scope: 'org',
    organizationId: String(organizationId),
    id: TYPE_ID,
    class: 'item',
    version: 1,
    name: 'Widget',
    fields: { serial: { base: 'string', identifier: true } },
    states: {
      main: { initial: 'GOO', values: ['GOO', 'CHANGED'], terminal: ['CHANGED'] }
    },
    transitions: [{ axis: 'main', from: 'GOO', to: 'CHANGED', intent: 'change' }]
  };
}

async function insertInstance(db, { organizationId, state = 'GOO' }) {
  const doc = {
    _id: new ObjectId(),
    type: TYPE_ID,
    typeVersion: 1,
    organizationId: String(organizationId),
    name: 'Widget one',
    fields: { serial: 'W-1' },
    states: { main: state },
    lineage: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.collection('items').insertOne(doc);
  return doc._id;
}

const memberAuth = organizationId => ({
  userId: 'operator-1',
  memberships: [{ organizationId, permissions: { 'cts-types': 'write' } }],
  permissions: { 'cts-types': 'write' }
});

describe('declaration-derived state machines', () => {
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
    mockedConnectDB.mockReturnValue(db);
    await db.collection('cts_types').deleteMany({});
    await db.collection('items').deleteMany({});
    await db.collection('status_events').deleteMany({});
    await db.collection('workflow_overrides').deleteMany({});
    await db.collection('cts_types').insertOne(storedDeclaration(ORG));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockedConnectDB.mockReturnValue(db);
  });

  it('serves actions from the declaration machine and executes the transition (GOO -> CHANGED)', async () => {
    const instanceId = await insertInstance(db, { organizationId: ORG });

    const actions = await stateService.getActions(TYPE_ID, instanceId, memberAuth(ORG));
    expect(actions.state).toEqual({ main: 'GOO' });
    expect(actions.actions).toEqual([
      expect.objectContaining({ from: 'GOO', to: 'CHANGED', intent: 'change', region: 'main' })
    ]);

    await stateService.transition(TYPE_ID, instanceId, 'CHANGED', 'operator-1', memberAuth(ORG));

    const doc = await db.collection('items').findOne({ _id: instanceId });
    expect(doc.states.main).toBe('CHANGED');
    const event = await db.collection('status_events').findOne({ targetId: instanceId });
    expect(event.toState).toBe('CHANGED');
    expect(event.targetType).toBe(TYPE_ID);
    expect(event.operation).toMatchObject({ kind: 'transition', region: 'main' });

    // Terminal target: no further actions from CHANGED.
    const after = await stateService.getActions(TYPE_ID, instanceId, memberAuth(ORG));
    expect(after.actions).toEqual([]);
  });

  it('executes the declared intent through applyIntent', async () => {
    const instanceId = await insertInstance(db, { organizationId: ORG });

    await stateService.applyIntent(TYPE_ID, instanceId, 'change', memberAuth(ORG), {}, { source: { kind: 'test' } });

    const doc = await db.collection('items').findOne({ _id: instanceId });
    expect(doc.states.main).toBe('CHANGED');
    const event = await db.collection('status_events').findOne({ targetId: instanceId });
    expect(event.operation).toMatchObject({ kind: 'intent', intent: 'change' });
  });

  it('respects tenancy: another organization resolves no machine for the type', async () => {
    const instanceId = await insertInstance(db, { organizationId: OTHER_ORG });

    const actions = await stateService.getActions(TYPE_ID, instanceId, memberAuth(OTHER_ORG));
    expect(actions.actions).toEqual([]);
    await expect(stateService.transition(
      TYPE_ID, instanceId, 'CHANGED', 'operator-1', memberAuth(OTHER_ORG)
    )).rejects.toThrow(/No state machine defined/);
  });

  it('types without any machine source keep the empty-actions contract', async () => {
    // A type id nothing stored: no declaration (the caches invalidate at
    // the defineType/removeType write boundary, so a never-written id
    // resolves cleanly), no domain workflow, no override.
    const bareTypeId = 't-neverdeclared';
    const doc = {
      _id: new ObjectId(),
      type: bareTypeId,
      typeVersion: 1,
      organizationId: ORG,
      name: 'Bare',
      fields: {},
      states: { main: 'GOO' },
      lineage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('items').insertOne(doc);

    const actions = await stateService.getActions(bareTypeId, doc._id, memberAuth(ORG));
    expect(actions).toEqual({ typeId: bareTypeId, targetId: doc._id, state: { main: 'GOO' }, actions: [] });
  });
});
