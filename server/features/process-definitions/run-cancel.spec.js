import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { DurableRunRepository } from './run-repository.js';
import { advanceProcessRun } from '~/packages/processes/src/index.js';

// Cancellation (SPEC "Process authoring maturity" 6): only parked runs
// cancel; the cancellation claims outstanding invocations, skips waiting
// steps, and leaves the run in 'cancelled' — the status the advancement
// loop never picks up again.
function waitingRun() {
  return {
    id: 'run-1',
    status: 'waiting',
    tokens: [],
    steps: {
      'step-1': { id: 'step-1', status: 'succeeded' },
      'step-2': { id: 'step-2', status: 'waiting' }
    },
    joins: { 'joinA:root': ['fork-a'] },
    loops: {},
    pendingEffect: { stepId: 'step-2', nodeId: 'node-2', invocationId: null, controlToken: null },
    context: { inputs: {} }
  };
}

function invocationInput(runId) {
  return {
    runId,
    stepId: 'step-2',
    request: { record: { nodeId: 'node-2' } },
    expectedCompletionSockets: ['completed'],
    connectedRoutes: []
  };
}

describe('run cancellation', () => {
  let con;
  let mongoServer;
  let repository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    repository = await new DurableRunRepository({ connection: con.db() }).initialize();
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  it('cancels a waiting run: invocations claimed, steps skipped, never advanced again', async () => {
    await repository.createRun({
      run: waitingRun(),
      definition: { _id: 'def-1', identity: { name: 'Order flow' }, data: {} },
      controlScope: { organizationId: 'org-1' }
    });
    const invocation = await repository.createInvocation(invocationInput('run-1'));
    await repository.markDispatched(invocation.invocationId, { taskRunId: 'task-9' });
    await repository.recordWait(invocation.invocationId, { waitId: 'wait-1' });

    const cancelled = await repository.cancelRun('run-1', { actor: { userId: 'admin-1' }, reason: 'order withdrawn' });
    expect(cancelled.state.status).toBe('cancelled');
    expect(cancelled.state.cancelled).toMatchObject({ by: 'admin-1', reason: 'order withdrawn' });
    expect(cancelled.state.pendingEffect).toBeUndefined();
    expect(cancelled.state.steps['step-2'].status).toBe('skipped');

    const outstanding = await repository.findUnreceiptedInvocations({ runId: 'run-1' });
    expect(outstanding).toEqual([]);
    const claimed = await repository.collection('invocations').findOne({ _id: invocation.invocationId });
    expect(claimed.status).toBe('cancelled');
    expect(claimed.receiptId).toBeTruthy();
    const wait = await repository.collection('waits').findOne({ _id: 'wait-1' });
    expect(wait.status).toBe('cancelled');

    // A late worker receipt is a duplicate, and the dead state never
    // advances regardless of what the environment offers.
    const receipt = await repository.ingestReceipt({ invocationId: invocation.invocationId, socketId: 'completed', output: { late: true } });
    expect(receipt.applied).toBe(false);
    const after = await repository.collection('runs').findOne({ _id: 'run-1' });
    expect(after.state.status).toBe('cancelled');
    const advanced = await advanceProcessRun(
      structuredClone(after.state),
      { graph: { nodes: [], edges: [] }, processNodes: {}, dataflowVersion: 4 },
      {}
    );
    expect(advanced.status).toBe('cancelled');
  });

  it('refuses to cancel terminal or running runs', async () => {
    await repository.createRun({
      run: { ...waitingRun(), id: 'run-done', status: 'succeeded' },
      definition: { _id: 'def-1', data: {} },
      controlScope: { organizationId: 'org-1' }
    });
    await expect(repository.cancelRun('run-done')).rejects.toThrow(/only waiting runs/);
    await expect(repository.cancelRun('run-1')).rejects.toThrow(/only waiting runs/);
    await expect(repository.cancelRun('missing')).rejects.toThrow(/not found/);
  });
});
