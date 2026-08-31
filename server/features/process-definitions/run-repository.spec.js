import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableRunRepository } from './run-repository.js';

const clone = value => value == null ? value : structuredClone(value);

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = record[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return expected.$in.includes(actual);
    }
    return actual === expected;
  });
}

function applyUpdate(record, update) {
  for (const [key, value] of Object.entries(update.$set || {})) record[key] = clone(value);
  for (const [key, value] of Object.entries(update.$inc || {})) record[key] = Number(record[key] || 0) + value;
  for (const [key, value] of Object.entries(update.$push || {})) {
    record[key] ||= [];
    record[key].push(...clone(value.$each || [value]));
  }
}

class PersistentMongoFixture {
  constructor(state = new Map()) {
    this.state = state;
    this.queue = Promise.resolve();
  }

  collection(name) {
    if (!this.state.has(name)) this.state.set(name, new Map());
    const records = this.state.get(name);
    return {
      createIndex: async () => undefined,
      insertOne: async record => {
        if (records.has(record._id)) throw new Error(`duplicate ${record._id}`);
        records.set(record._id, clone(record));
      },
      findOne: async query => clone([...records.values()].find(record => matches(record, query)) || null),
      find: query => ({ toArray: async () => clone([...records.values()].filter(record => matches(record, query))) }),
      findOneAndUpdate: async (query, update) => {
        const record = [...records.values()].find(candidate => matches(candidate, query));
        if (!record) return null;
        applyUpdate(record, update);
        return clone(record);
      },
      updateOne: async (query, update) => {
        const record = [...records.values()].find(candidate => matches(candidate, query));
        if (!record) return { matchedCount: 0 };
        applyUpdate(record, update);
        return { matchedCount: 1 };
      }
    };
  }

  async startSession() {
    const fixture = this;
    return {
      async withTransaction(work) {
        const previous = fixture.queue;
        let release;
        fixture.queue = new Promise(resolve => { release = resolve; });
        await previous;
        const snapshot = clone([...fixture.state].map(([name, records]) => [name, [...records]]));
        try {
          await work();
        } catch (error) {
          fixture.state.clear();
          for (const [name, entries] of snapshot) fixture.state.set(name, new Map(entries));
          throw error;
        } finally {
          release();
        }
      },
      async endSession() {}
    };
  }
}

function invocation(overrides = {}) {
  return {
    runId: 'run-1',
    stepId: 'task-1',
    invocationId: 'invocation-1',
    invocationIdentity: { runId: 'run-1', stepId: 'task-1', attempt: 1 },
    producerIdentity: { nodeId: 'task-1', outputSocketId: 'done' },
    controlScope: { organizationId: 'org-1' },
    expectedCompletionSockets: ['done'],
    connectedRoutes: [{ id: 'route-1', sourceNodeId: 'task-1', sourceSocketId: 'done', targetNodeId: 'next' }],
    request: { kind: 'effect.runTask' },
    ...overrides
  };
}

async function seededRepository(connection) {
  const repository = new DurableRunRepository({ connection, id: (() => { let id = 0; return () => `generated-${++id}`; })() });
  await repository.initialize();
  await repository.createRun({
    run: { id: 'run-1', status: 'running' },
    definition: { id: 'process-1' },
    producerIdentity: { nodeId: 'trigger', outputSocketId: 'out' },
    controlScope: { organizationId: 'org-1' }
  });
  return repository;
}

test('execution records survive repository restart with durable identity and revision fields', async () => {
  const connection = new PersistentMongoFixture();
  const first = await seededRepository(connection);
  await first.createInvocation(invocation());
  await first.recordWait('invocation-1', { waitId: 'wait-1', dueAt: '2026-09-01T00:00:00.000Z' });
  await first.markDispatched('invocation-1', { dispatchId: 'task-remote-1' });
  await first.ingestReceipt({ invocationId: 'invocation-1', receiptId: 'receipt-1', outputId: 'output-1', socketId: 'done', output: { ok: true } });

  const reopened = new DurableRunRepository({ connection });
  const execution = await reopened.getExecution('run-1');
  assert.equal(execution.run.revision, 1);
  assert.equal(execution.invocations.length, 1);
  assert.equal(execution.waits.length, 1);
  assert.equal(execution.outputs.length, 1);
  assert.equal(execution.steps.length, 1);
  assert.equal(execution.receipts.length, 1);
  for (const record of [execution.run, ...execution.invocations, ...execution.waits, ...execution.outputs, ...execution.steps, ...execution.receipts]) {
    assert.ok(Object.hasOwn(record, 'revision'));
    assert.ok(Object.hasOwn(record, 'producerIdentity'));
    assert.ok(Object.hasOwn(record, 'controlScope'));
    assert.ok(Object.hasOwn(record, 'invocationIdentity'));
  }
});

test('invocation snapshots sockets and routes before receipt ingestion', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  const created = await repository.createInvocation(invocation());
  assert.deepEqual(created.expectedCompletionSockets, ['done']);
  assert.equal(created.connectedRoutes[0].id, 'route-1');
  await repository.markDispatched(created.invocationId);

  const stored = repository.connection.state.get('execution_step_invocations').get(created.invocationId);
  delete stored.connectedRoutes;
  await assert.rejects(
    repository.ingestReceipt({ invocationId: created.invocationId, receiptId: 'receipt-1', socketId: 'done' }),
    /connected route snapshot/
  );
});

test('concurrent duplicate receipt delivery advances connected routes exactly once', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  await repository.createInvocation(invocation());
  await repository.markDispatched('invocation-1');
  let advances = 0;
  const deliver = () => repository.ingestReceipt(
    { invocationId: 'invocation-1', receiptId: 'receipt-1', outputId: 'output-1', socketId: 'done', output: 42 },
    { advance: async () => { advances += 1; } }
  );
  const results = await Promise.all([deliver(), deliver()]);
  assert.deepEqual(results.map(result => result.applied).sort(), [false, true]);
  assert.equal(advances, 1);
  const execution = await repository.getExecution('run-1');
  assert.equal(execution.run.advancementCount, 1);
  assert.equal(execution.run.advancedRoutes.length, 1);
  assert.equal(execution.receipts.length, 1);
  assert.equal(execution.outputs.length, 1);
});

test('restart discovers dispatched invocation without receipt and accepts redelivery once', async () => {
  const connection = new PersistentMongoFixture();
  const beforeCrash = await seededRepository(connection);
  await beforeCrash.createInvocation(invocation());
  const dispatched = await beforeCrash.markDispatched('invocation-1', { dispatchId: 'remote-1' });
  assert.equal(dispatched.status, 'dispatched');

  const recovered = new DurableRunRepository({ connection });
  const pending = await recovered.findUnreceiptedInvocations();
  assert.equal(pending.length, 1);
  const retry = await recovered.retryInvocation('invocation-1', pending[0].revision);
  assert.equal(retry.attempt, 2);
  assert.equal((await recovered.ingestReceipt({ invocationId: 'invocation-1', receiptId: 'receipt-late', socketId: 'done', output: 'complete' })).applied, true);
  assert.equal((await recovered.ingestReceipt({ invocationId: 'invocation-1', receiptId: 'receipt-late', socketId: 'done', output: 'complete' })).applied, false);
});

test('dispatch is non-terminal and only a durable receipt records terminal task output', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  await repository.createInvocation(invocation());
  await repository.markDispatched('invocation-1', { dispatchId: 'remote-1', returned: { ignored: true } });
  let execution = await repository.getExecution('run-1');
  assert.equal(execution.invocations[0].status, 'dispatched');
  assert.equal(execution.steps[0].status, 'awaiting-receipt');
  assert.equal(execution.outputs.length, 0);
  assert.equal(execution.run.state.status, 'running');

  await repository.ingestReceipt({ invocationId: 'invocation-1', receiptId: 'receipt-1', outputId: 'output-1', socketId: 'done', output: { terminal: true } });
  execution = await repository.getExecution('run-1');
  assert.equal(execution.invocations[0].status, 'completed');
  assert.equal(execution.steps[0].status, 'completed');
  assert.deepEqual(execution.outputs[0].value, { terminal: true });
});
