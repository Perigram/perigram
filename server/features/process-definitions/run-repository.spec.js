import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableRunRepository, continueStoredRun, executeManualRun } from './run-repository.js';
import { resumeProcessRun } from '../../../packages/processes/src/index.js';

const clone = value => value == null ? value : structuredClone(value);

function resolvePath(record, path) {
  return path.split('.').reduce((value, segment) => (value == null ? undefined : value[segment]), record);
}

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = resolvePath(record, key);
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

test('conflicting completion identity cannot consume the wait twice', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  await repository.createInvocation(invocation());
  await repository.markDispatched('invocation-1');
  let advances = 0;
  const first = await repository.ingestReceipt(
    { invocationId: 'invocation-1', receiptId: 'receipt-1', outputId: 'output-1', socketId: 'done', output: 42 },
    { advance: async () => { advances += 1; } }
  );
  assert.equal(first.applied, true);

  const conflicting = await repository.ingestReceipt(
    { invocationId: 'invocation-1', receiptId: 'receipt-conflicting', outputId: 'output-1', socketId: 'done', output: 43 },
    { advance: async () => { advances += 1; } }
  );
  assert.equal(conflicting.applied, false);
  assert.equal(conflicting.reason, 'duplicate');

  const execution = await repository.getExecution('run-1');
  assert.equal(advances, 1);
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

test('manual execution persists only declared async boundaries and leaves their graph step waiting', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  const definition = {
    id: 'process-async',
    data: {
      dataflowVersion: 4,
      processNodes: {
        command: {
          id: 'command',
          kind: 'effect.runCommand',
          commandId: 'dispatch',
          trigger: { mode: 'manual' },
          outputs: ['done']
        }
      },
      graph: {
        nodes: [{ id: 'command', type: 'processNode', data: { refId: 'command' } }],
        edges: []
      }
    }
  };

  const run = await executeManualRun(definition, { trigger: { nodeId: 'command' } }, {
    actor: { organizationId: 'org-1' },
    repository,
    executeEffect: async () => ({ taskId: 'task-1', tasks: [{ id: 'task-1' }] }),
    isAsyncBoundary: (_request, result) => result.tasks.length > 0,
    data: () => ({})
  });

  assert.equal(run.status, 'waiting');
  assert.equal(run.steps[0].status, 'waiting');
  const execution = await repository.getExecution(run.id);
  assert.equal(execution.invocations.length, 1);
  assert.equal(execution.invocations[0].status, 'dispatched');
  assert.equal(execution.outputs.length, 0);
});

function chainedAsyncDefinition() {
  return {
    id: 'process-chained',
    data: {
      dataflowVersion: 4,
      processNodes: {
        command1: {
          id: 'command1',
          kind: 'effect.runCommand',
          commandId: 'dispatch',
          trigger: { mode: 'manual' },
          outputs: ['sheet_design']
        },
        command2: {
          id: 'command2',
          kind: 'effect.runCommand',
          commandId: 'finish',
          outputs: []
        }
      },
      graph: {
        nodes: ['command1', 'command2'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [{ id: 'command1-command2', source: 'command1', sourceHandle: 'completed', target: 'command2', targetHandle: 'trigger', role: 'control' }]
      }
    }
  };
}

function chainedEnvironment(fixture = {}) {
  return {
    executeEffect: async request => {
      if (request.record.id === 'command1') {
        return fixture.command1Result || { raw: { jobs: [{ type: 'task_run', id: 'task-run-9' }] } };
      }
      return { entities: [{ type: 'sheet', id: 'sheet-final' }], data: { finished: true } };
    },
    isAsyncBoundary: (request, result) => request.record.id === 'command1'
      && [...(result.jobs || []), ...(result.raw?.jobs || [])].some(job => job?.type === 'task_run'),
    catalogContext: () => ({
      command: {
        output: {
          entities: [
            { type: 'sheet_design', persistenceOwner: 'commandOwned', timing: 'completion' },
            { type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }
          ]
        }
      }
    }),
    domain: { entities: [] },
    data: () => ({})
  };
}

test('task completion correlates by dispatch task run id, resumes the step, and drives the run to completion', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  const definition = chainedAsyncDefinition();
  const environment = chainedEnvironment();

  const run = await executeManualRun(definition, { trigger: { nodeId: 'command1' } }, {
    actor: { organizationId: 'org-1' },
    repository,
    ...environment
  });
  assert.equal(run.status, 'waiting');
  assert.equal(run.steps[0].status, 'waiting');

  const invocation = await repository.findInvocationByTaskRunId('task-run-9');
  assert.ok(invocation, 'dispatch task run id must correlate to the waiting invocation');
  assert.equal(invocation.runId, run.id);

  const ingested = await repository.ingestReceipt({
    invocationId: invocation.invocationId,
    socketId: '',
    output: {
      entities: [
        { type: 'nesting_run', id: 'run-9' },
        { type: 'sheet_design', id: 'design-9' }
      ]
    }
  }, {
    advance: async ({ invocation: claimed, output, session }) => {
      const current = await repository.collection('runs').findOne({ _id: claimed.runId }, { session });
      const resumed = await resumeProcessRun(current.state, definition.data, {
        invocationId: claimed.invocationId,
        output
      }, {
        catalogContext: environment.catalogContext,
        domain: environment.domain,
        data: environment.data
      });
      return { state: resumed };
    }
  });
  assert.equal(ingested.applied, true);

  const afterReceipt = await repository.collection('runs').findOne({ _id: run.id });
  assert.equal(afterReceipt.state.status, 'running');
  assert.equal(afterReceipt.state.steps[0].status, 'succeeded');
  assert.deepEqual(afterReceipt.state.steps[0].output.entities.map(entity => entity.type).sort(), ['nesting_run', 'sheet_design']);

  const completed = await continueStoredRun(afterReceipt, definition, {}, {
    actor: { organizationId: 'org-1' },
    repository,
    ...environment
  });
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.steps.length, 2);
  assert.deepEqual(completed.steps[1].output.entities, [{ type: 'sheet', id: 'sheet-final' }]);

  const duplicate = await repository.ingestReceipt({ invocationId: invocation.invocationId, socketId: '', output: { entities: [] } });
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'duplicate');
});

test('failure ingestion fails the waiting run and records a failure receipt exactly once', async () => {
  const repository = await seededRepository(new PersistentMongoFixture());
  const definition = chainedAsyncDefinition();
  const environment = chainedEnvironment();
  const run = await executeManualRun(definition, { trigger: { nodeId: 'command1' } }, {
    actor: { organizationId: 'org-1' },
    repository,
    ...environment
  });
  const invocation = await repository.findInvocationByTaskRunId('task-run-9');

  const failed = await repository.failInvocation(invocation.invocationId, {
    error: { message: 'Solver crashed' }
  }, {
    advance: async ({ invocation: claimed, session }) => {
      const current = await repository.collection('runs').findOne({ _id: claimed.runId }, { session });
      const state = structuredClone(current.state);
      const step = state.steps.find(item => item.id === state.pendingEffect?.stepId);
      if (step) {
        step.status = 'failed';
        step.error = { message: 'Solver crashed' };
      }
      delete state.pendingEffect;
      state.status = 'failed';
      state.error = { message: 'Solver crashed' };
      return { state };
    }
  });
  assert.equal(failed.applied, true);

  const execution = await repository.getExecution(run.id);
  assert.equal(execution.invocations[0].status, 'failed');
  assert.equal(execution.steps[0].status, 'failed');
  assert.equal(execution.run.state.status, 'failed');
  assert.equal(execution.receipts[0].output.error.message, 'Solver crashed');
  assert.equal(execution.outputs.length, 0);

  const duplicate = await repository.failInvocation(invocation.invocationId, { error: { message: 'Solver crashed' } });
  assert.equal(duplicate.applied, false);
});
