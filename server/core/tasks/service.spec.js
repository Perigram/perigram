import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const {
  definitions,
  processEventsMock,
  processEffectsMock,
  continueActionFromTask,
  failActionFromTask,
  mockedConnectDB
} = vi.hoisted(() => ({
  definitions: new Map(),
  processEventsMock: vi.fn(),
  processEffectsMock: vi.fn(),
  continueActionFromTask: vi.fn(),
  failActionFromTask: vi.fn(),
  mockedConnectDB: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({ connectDB: mockedConnectDB }));

vi.mock('../../runtime/app-registry.js', () => ({
  getAppRegistry: () => ({
    getTaskDefinition: id => definitions.get(id) || null,
    listTaskDefinitions: () => [...definitions.values()]
  })
}));

vi.mock('../effects/service.js', () => ({
  processEvents: processEventsMock,
  processEffects: processEffectsMock,
  mergeProcessedEffects: (left = {}, right = {}) => {
    const keys = ['entities', 'tasks', 'transitions', 'events', 'attachments'];
    return Object.fromEntries(keys.map(key => [key, [...(left[key] || []), ...(right[key] || [])]]));
  }
}));

vi.mock('../../features/process-definitions/service.js', () => ({
  continueActionFromTask,
  failActionFromTask
}));

import * as repository from './repository.js';
import * as service from './service.js';

const emptyProcessed = () => ({ entities: [], tasks: [], transitions: [], events: [], attachments: [] });

const taskDefinition = (overrides = {}) => ({
  id: 'compute',
  service: 'compute',
  status: {
    queued: 'QUEUED',
    running: 'RUNNING',
    retryWait: 'RETRY_WAIT',
    succeeded: 'SUCCEEDED',
    failed: 'FAILED',
    cancelled: 'CANCELLED'
  },
  retry: { maxAttempts: 3, backoffMs: 1 },
  ...overrides
});

describe('task run transitions', () => {
  let client;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongoServer.getUri());
    db = client.db();
    mockedConnectDB.mockResolvedValue(db);
  });

  afterAll(async () => {
    await client?.close();
    await mongoServer?.stop();
  });

  beforeEach(async () => {
    definitions.clear();
    processEventsMock.mockReset().mockResolvedValue(emptyProcessed());
    processEffectsMock.mockReset().mockResolvedValue(emptyProcessed());
    continueActionFromTask.mockReset();
    failActionFromTask.mockReset();
    await db.dropDatabase();
  });

  it('claims runtime-declared tasks when the static registry has no status map', async () => {
    const definition = taskDefinition({
      id: 'plugin.dynamic.compute',
      service: 'plugin.dynamic',
      executor: { workerType: 'plugin.dynamic@org-1' }
    });
    await service.enqueueTask('plugin.dynamic.compute', {}, {
      userId: 'user-1',
      organizationId: 'org-1'
    }, { definition, workerType: 'plugin.dynamic@org-1' });

    const claimed = await service.claimTask({ workerType: 'plugin.dynamic@org-1' });

    expect(claimed).toMatchObject({
      taskId: 'plugin.dynamic.compute',
      status: 'RUNNING',
      workerType: 'plugin.dynamic@org-1'
    });
    expect(claimed.attempts).toBe(1);
  });

  it('keeps connector task completions as values and never executes worker-supplied effects', async () => {
    const workerType = 'plugin.docs@org-1';
    definitions.set('plugin.docs.generate', taskDefinition({
      id: 'plugin.docs.generate',
      service: 'plugin.docs',
      executor: { workerType },
      output: {}
    }));
    const run = await service.enqueueTask('plugin.docs.generate', {}, {
      userId: 'user-1',
      organizationId: 'org-1'
    }, { workerType });
    const claimed = await service.claimTask({ taskId: run.taskId, workerType });
    const workerValue = {
      data: { documentId: 'doc-1', title: 'Generated' },
      effects: [{ type: 'createEntity', entity: { type: 'project' }, data: { name: 'Injected' } }],
      events: [{ type: 'forged.event' }]
    };

    const completed = await service.completeTaskRun(claimed._id, workerValue, claimed.claimToken, { workerType });

    expect(completed.output.data).toEqual(workerValue.data);
    expect(completed.output.effects).toEqual(emptyProcessed());
    expect(processEffectsMock).not.toHaveBeenCalled();
    expect(processEventsMock).not.toHaveBeenCalled();
    expect(continueActionFromTask).toHaveBeenCalledWith({
      taskRunId: String(claimed._id),
      taskResult: completed.output
    });
  });

  it('applies a duplicate completion as a no-op before effects run again', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const claimed = await service.claimTask({ taskId: 'compute' });

    const completed = await service.completeTaskRun(claimed._id, {}, claimed.claimToken);
    expect(completed.status).toBe('SUCCEEDED');
    expect(completed.finishedAt).toBeInstanceOf(Date);
    expect(processEffectsMock).toHaveBeenCalledTimes(1);

    const replayed = await service.completeTaskRun(claimed._id, {}, claimed.claimToken);
    expect(replayed.status).toBe('SUCCEEDED');
    expect(processEffectsMock).toHaveBeenCalledTimes(1);
    expect(continueActionFromTask).toHaveBeenCalledTimes(1);
  });

  it('applies a duplicate failure as a no-op before effects run again', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const claimed = await service.claimTask({ taskId: 'compute' });

    const failed = await service.failTaskRun(
      claimed._id,
      Object.assign(new Error('invalid input'), { statusCode: 400 }),
      claimed.claimToken
    );
    expect(failed.status).toBe('FAILED');
    expect(failed.finishedAt).toBeInstanceOf(Date);
    expect(processEffectsMock).toHaveBeenCalledTimes(1);

    const replayed = await service.failTaskRun(
      claimed._id,
      Object.assign(new Error('invalid input'), { statusCode: 400 }),
      claimed.claimToken
    );
    expect(replayed.status).toBe('FAILED');
    expect(processEffectsMock).toHaveBeenCalledTimes(1);
    expect(failActionFromTask).toHaveBeenCalledTimes(1);
  });

  it('cancels a non-terminal run and leaves a terminal run unchanged', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const [run] = await repository.list({ taskId: 'compute' });

    const cancelled = await service.cancelTaskRun(run._id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.finishedAt).toBeInstanceOf(Date);
    expect(failActionFromTask).toHaveBeenCalledTimes(1);

    const replayed = await service.cancelTaskRun(run._id);
    expect(replayed.status).toBe('CANCELLED');
    expect(failActionFromTask).toHaveBeenCalledTimes(1);
  });

  it('prevents a connector worker from cancelling another connector queue run', async () => {
    definitions.set('compute', taskDefinition());
    const run = await service.enqueueTask('compute', {}, {}, { workerType: 'plugin.alpha@org-1' });

    await expect(service.cancelTaskRun(run._id, 'foreign cancel', {
      workerType: 'plugin.beta@org-2'
    })).rejects.toMatchObject({ statusCode: 403 });
    expect((await repository.findById(run._id)).status).toBe('QUEUED');

    const cancelled = await service.cancelTaskRun(run._id, 'own queue cancel', {
      workerType: 'plugin.alpha@org-1'
    });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('scopes admin task-run history to the requested organization', async () => {
    await repository.create({
      taskId: 'task-one',
      auth: { userId: 'u1', organizationId: 'org-a' },
      status: 'SUCCEEDED'
    });
    await repository.create({
      taskId: 'task-one',
      auth: { userId: 'u2', organizationId: 'org-b' },
      status: 'SUCCEEDED'
    });

    const runs = await service.listTaskRuns({ organizationId: 'org-a' });
    expect(runs).toHaveLength(1);
    expect(runs[0].auth.organizationId).toBe('org-a');
  });

  it('retries only from the failed or retry-wait statuses', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const claimed = await service.claimTask({ taskId: 'compute' });
    await service.failTaskRun(
      claimed._id,
      Object.assign(new Error('invalid input'), { statusCode: 400 }),
      claimed.claimToken
    );
    await repository.updateById(claimed._id, { status: 'RETRY_WAIT' });

    const retried = await service.retryTaskRun(claimed._id);
    expect(retried.status).toBe('QUEUED');
    expect(retried.finishedAt).toBeNull();
    expect(retried.claimToken).toBeNull();

    await expect(service.retryTaskRun(claimed._id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects completion if the worker loses its claim while effects are processing', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const claimed = await service.claimTask({ taskId: 'compute' });

    processEffectsMock.mockImplementationOnce(async () => {
      await repository.updateById(claimed._id, {
        claimToken: 'replacement-worker-token',
        workerId: 'replacement-worker'
      });
      return emptyProcessed();
    });

    await expect(service.completeTaskRun(claimed._id, {}, claimed.claimToken))
      .rejects.toMatchObject({ statusCode: 409, message: 'Task run claim was lost' });

    const current = await repository.findById(claimed._id);
    expect(current.status).toBe('RUNNING');
    expect(current.claimToken).toBe('replacement-worker-token');
    expect(continueActionFromTask).not.toHaveBeenCalled();
  });

  it('reclaims an expired lease and rejects the previous claim token', async () => {
    definitions.set('compute', taskDefinition());
    await service.enqueueTask('compute');
    const first = await service.claimTask({ taskId: 'compute', leaseMs: -1000 });
    const second = await service.claimTask({ taskId: 'compute' });

    expect(String(second._id)).toBe(String(first._id));
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.attempts).toBe(2);

    await expect(service.completeTaskRun(second._id, {}, first.claimToken))
      .rejects.toMatchObject({ statusCode: 409 });
    const completed = await service.completeTaskRun(second._id, {}, second.claimToken);
    expect(completed.status).toBe('SUCCEEDED');
  });

  it('reads terminal names from the task definition status map', async () => {
    definitions.set('named', taskDefinition({
      id: 'named',
      service: 'named',
      status: {
        queued: 'WAITING',
        running: 'ACTIVE',
        retryWait: 'BACKOFF',
        succeeded: 'DONE',
        failed: 'BROKEN',
        cancelled: 'STOPPED'
      },
      retry: { maxAttempts: 1, backoffMs: 1 }
    }));

    const queued = await service.enqueueTask('named', {}, {}, { idempotencyKey: 'named-key' });
    expect(queued.status).toBe('WAITING');
    const replayedEnqueue = await service.enqueueTask('named', {}, {}, { idempotencyKey: 'named-key' });
    expect(String(replayedEnqueue._id)).toBe(String(queued._id));

    const claimed = await service.claimTask({ taskId: 'named' });
    const completed = await service.completeTaskRun(claimed._id, {}, claimed.claimToken);
    expect(completed.status).toBe('DONE');

    const cancelledReplay = await service.cancelTaskRun(claimed._id);
    expect(cancelledReplay.status).toBe('DONE');

    await service.enqueueTask('named');
    const failing = await service.claimTask();
    expect(failing.status).toBe('ACTIVE');
    const failed = await service.failTaskRun(
      failing._id,
      Object.assign(new Error('invalid input'), { statusCode: 400 }),
      failing.claimToken
    );
    expect(failed.status).toBe('BROKEN');

    const retried = await service.retryTaskRun(failing._id);
    expect(retried.status).toBe('WAITING');

    const cancelled = await service.cancelTaskRun(failing._id);
    expect(cancelled.status).toBe('STOPPED');
  });
});
