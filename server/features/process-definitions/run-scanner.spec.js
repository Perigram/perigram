import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const { mockedConnectDB, firedRuns, resumedRuns, clock, failNodes } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  firedRuns: [],
  resumedRuns: [],
  clock: { now: null },
  failNodes: new Set()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('./service.js', async () => {
  const { persistRun } = await import('./run-store.js');
  return {
    runDefinitionEntry: vi.fn(async (definition, trigger, meta) => {
      if (failNodes.has(meta.nodeId)) throw new Error(`fire ${meta.nodeId} failed`);
      const createdAt = (clock.now || new Date()).toISOString();
      firedRuns.push({ definitionId: String(definition._id), nodeId: meta.nodeId, kind: meta.kind });
      await persistRun(definition,
        { id: `run-${firedRuns.length}`, status: 'succeeded', createdAt, updatedAt: createdAt }, meta);
    }),
    resumeParkedRun: vi.fn(async record => {
      resumedRuns.push(record._id);
    })
  };
});

import { scanDueProcessRuns } from './run-scanner.js';
import { persistRun, persistEvent } from './run-store.js';

const definitionDoc = () => ({
  _id: 'def-1',
  states: { main: 'ACTIVE' },
  lineage: { organizationId: 'org-1' },
  data: {
    processNodes: {
      'node-once': { id: 'node-once', kind: 'cts.emit', trigger: { mode: 'schedule', schedule: { at: '2026-10-27T10:00:00Z' } } },
      'node-hourly': { id: 'node-hourly', kind: 'cts.emit', trigger: { mode: 'schedule', schedule: { interval: 'PT1H' } } },
      'node-sub': { id: 'node-sub', kind: 'cts.emit', eventId: 'org1.test', trigger: { mode: 'event' } },
      'node-manual': { id: 'node-manual', kind: 'cts.emit', trigger: { mode: 'manual' } }
    }
  }
});

describe('process run scanner', () => {
  let replSet, client, db;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    client = new MongoClient(replSet.getUri());
    await client.connect();
    db = client.db('perigram_test');
    mockedConnectDB.mockResolvedValue(db);
  });

  afterAll(async () => {
    await client.close();
    await replSet.stop();
  });

  beforeEach(async () => {
    await db.collection('process_definitions').deleteMany({});
    await db.collection('process_executions').deleteMany({});
    await db.collection('process_events').deleteMany({});
    await db.collection('process_definitions').insertOne(definitionDoc());
    firedRuns.length = 0;
    resumedRuns.length = 0;
    failNodes.clear();
  });

  it('fires a due one-shot once, not on every scan', async () => {
    clock.now = new Date('2026-10-27T10:00:30Z');
    const first = await scanDueProcessRuns(clock.now);
    expect(first.scheduleFires).toBe(2);
    expect(firedRuns.map(run => run.nodeId).sort()).toEqual(['node-hourly', 'node-once']);

    const second = await scanDueProcessRuns(new Date('2026-10-27T10:00:45Z'));
    expect(second.scheduleFires).toBe(0);
    expect(firedRuns.filter(run => run.nodeId === 'node-once')).toHaveLength(1);
  });

  it('re-arms an interval only after the duration ages', async () => {
    clock.now = new Date('2026-10-27T10:00:30Z');
    await scanDueProcessRuns(clock.now);
    expect(firedRuns.filter(run => run.nodeId === 'node-hourly')).toHaveLength(1);

    await scanDueProcessRuns(new Date('2026-10-27T10:30:00Z'));
    expect(firedRuns.filter(run => run.nodeId === 'node-hourly')).toHaveLength(1);
    await scanDueProcessRuns(new Date('2026-10-27T11:00:31Z'));
    expect(firedRuns.filter(run => run.nodeId === 'node-hourly')).toHaveLength(2);
  });

  it('resumes a parked run whose wakeAt has passed', async () => {
    const definition = definitionDoc();
    await persistRun(definition,
      { id: 'run-parked', status: 'waiting', wakeAt: '2026-10-27T09:00:00Z', createdAt: '2026-10-27T08:59:00Z', updatedAt: '2026-10-27T08:59:00Z', context: { actor: { userId: 'SYSTEM', system: true, organizationId: 'org-1', memberships: [] } } });
    const summary = await scanDueProcessRuns(new Date('2026-10-27T10:00:30Z'));
    expect(summary.wakes).toBe(1);
    expect(resumedRuns).toEqual(['run-parked']);
  });

  it('delivers an undispatched event to subscribed entries and marks it dispatched', async () => {
    await persistEvent({ id: 'event-1', organizationId: 'org-1', type: 'org1.test', payload: { n: 1 } });
    const summary = await scanDueProcessRuns(new Date('2026-10-27T10:00:30Z'));
    expect(summary.events).toBe(1);
    expect(firedRuns.some(run => run.nodeId === 'node-sub' && run.kind === 'event')).toBe(true);
    const stored = await db.collection('process_events').findOne({ _id: 'event-1' });
    expect(stored).toMatchObject({ status: 'dispatched', attempts: 1, lastError: null });
    expect(stored.dispatchedAt).toBeTruthy();
  });

  it('retries a failed event to the cap and then settles it failed', async () => {
    failNodes.add('node-sub');
    await persistEvent({ id: 'event-failed', organizationId: 'org-1', type: 'org1.test', payload: { n: 1 } });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const summary = await scanDueProcessRuns(new Date('2026-10-27T10:00:30Z'));
      expect(summary.eventFailed).toBe(1);
      const stored = await db.collection('process_events').findOne({ _id: 'event-failed' });
      expect(stored.attempts).toBe(attempt);
      expect(stored.status).toBe(attempt === 5 ? 'failed' : 'pending');
      expect(stored.lastError).toMatch(/fire node-sub failed/);
    }
    const settled = await scanDueProcessRuns(new Date('2026-10-27T10:00:30Z'));
    expect(settled.eventFailed).toBe(0);
  });

  it('keeps a failed schedule unfired and retries the next scan', async () => {
    failNodes.add('node-once');
    const failed = await scanDueProcessRuns(new Date('2026-10-27T10:00:30Z'));
    expect(failed.scheduleFailed).toBe(1);
    expect(firedRuns.some(run => run.nodeId === 'node-once')).toBe(false);

    failNodes.delete('node-once');
    const fired = await scanDueProcessRuns(new Date('2026-10-27T10:00:45Z'));
    expect(fired.scheduleFires).toBe(1);
    expect(firedRuns.filter(run => run.nodeId === 'node-once')).toHaveLength(1);
  });
});
