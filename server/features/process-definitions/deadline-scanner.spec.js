import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
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

import { scanDueDeadlines } from './deadline-scanner.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';
import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';

// The compiled machine exactly as activation would emit it (SPEC §7): a
// deadline-marked state and its system-executed escalation edge.
const deadlineMachine = {
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'ACTIVE',
      states: {
        ACTIVE: { deadline: { after: 'PT48H', to: 'ESCALATED' } },
        ESCALATED: { terminal: true }
      },
      transitions: [{
        from: 'ACTIVE',
        to: 'ESCALATED',
        deadline: true,
        access: { system: true }
      }]
    }
  }
};

const activeDefinitionDoc = () => ({
  _id: 'def-1',
  states: { main: 'ACTIVE' },
  lineage: { organizationId: 'org-1' },
  data: {
    compiled: {
      producerOutputs: {
        'seed:entity': {
          producerOutputId: 'seed:entity',
          typeId: 'cassette',
          workflow: deadlineMachine
        }
      }
    }
  }
});

const flatInstance = (stateChangedAt, extra = {}) => ({
  _id: new ObjectId(),
  type: 'cassette',
  typeVersion: 1,
  organizationId: 'org-1',
  name: 'Cassette',
  fields: {},
  state: 'ACTIVE',
  stateChangedAt,
  lineage: { organizationId: 'org-1' },
  ...extra
});

describe('deadline scanner', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
    getPerigramRegistry().defineEntity({ type: 'cassette', collection: 'files', feature: 'cassettes' });
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockedConnectDB.mockReturnValue(db);
    await db.collection('files').deleteMany({});
    await db.collection('process_definitions').deleteMany({});
    await db.collection('status_events').deleteMany({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves only overdue instances, as SYSTEM, with the deadline stamp', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(deadlineMachine);
    const now = new Date();
    await db.collection('process_definitions').insertOne(activeDefinitionDoc());
    const overdue = flatInstance(new Date(now.getTime() - 72 * 3600 * 1000).toISOString());
    const fresh = flatInstance(new Date(now.getTime() - 3600 * 1000).toISOString());
    await db.collection('files').insertMany([overdue, fresh]);

    const summary = await scanDueDeadlines(now);
    expect(summary).toMatchObject({ deadlines: 1, moved: 1, refused: 0, failed: 0 });

    const moved = await db.collection('files').findOne({ _id: overdue._id });
    expect(moved.state).toBe('ESCALATED');
    expect(new Date(moved.stateChangedAt).getTime()).toBeGreaterThan(new Date(overdue.stateChangedAt).getTime());

    const untouched = await db.collection('files').findOne({ _id: fresh._id });
    expect(untouched.state).toBe('ACTIVE');

    const event = await db.collection('status_events').findOne({ targetId: overdue._id });
    expect(event.actor).toMatchObject({ id: 'SYSTEM', principalType: 'SYSTEM' });
    expect(event.source).toEqual({ kind: 'deadline', state: 'ACTIVE' });
  });

  it('counts guard refusals without moving the instance', async () => {
    const machine = structuredClone(deadlineMachine);
    const edge = machine.regions.main.transitions[0];
    edge.guard = { op: 'lt', args: [{ op: 'field', path: ['value', 'count'] }, { op: 'lit', value: 3 }] };
    machine.regions.main.states.ACTIVE.deadline.guard = edge.guard;
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(machine);
    const now = new Date();
    await db.collection('process_definitions').insertOne(activeDefinitionDoc());
    const blocked = flatInstance(new Date(now.getTime() - 72 * 3600 * 1000).toISOString(), { fields: { count: 5 } });
    await db.collection('files').insertOne(blocked);

    const summary = await scanDueDeadlines(now);
    expect(summary).toMatchObject({ deadlines: 1, moved: 0, refused: 1, failed: 0 });
    const doc = await db.collection('files').findOne({ _id: blocked._id });
    expect(doc.state).toBe('ACTIVE');
  });

  it('skips definitions without active compiled workflows', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(deadlineMachine);
    const now = new Date();
    await db.collection('process_definitions').insertOne({ ...activeDefinitionDoc(), states: { main: 'DRAFT' } });
    await db.collection('files').insertOne(flatInstance(new Date(now.getTime() - 72 * 3600 * 1000).toISOString()));

    const summary = await scanDueDeadlines(now);
    expect(summary).toMatchObject({ deadlines: 0, moved: 0 });
    const [doc] = await db.collection('files').find({}).toArray();
    expect(doc.state).toBe('ACTIVE');
  });
});
