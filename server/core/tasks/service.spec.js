import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB, taskExecutor } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  taskExecutor: vi.fn(async () => ({ data: { ok: true } }))
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('../../runtime/app-registry.js', () => {
  const task = {
    id: 'test.http',
    service: 'test',
    executor: { type: 'http', target: 'test-worker' },
    input: { entities: [], parameters: [] }
  };
  return {
    getAppRegistry: () => ({
      getTaskDefinition: id => id === task.id ? task : null,
      listTaskDefinitions: () => [task],
      getTaskExecutor: id => id === task.id ? taskExecutor : null
    })
  };
});

import { dispatchRegisteredTaskExecutors, enqueueTask, listTaskRuns } from './service.js';

describe('task service app-side executors', () => {
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
    taskExecutor.mockClear();
    await db.dropDatabase();
  });

  it('claims and completes queued tasks with a registered executor', async () => {
    const run = await enqueueTask('test.http', { parameters: {} }, { userId: 'user-1' });

    await dispatchRegisteredTaskExecutors({ workerId: 'spec-executor' });

    const [updated] = await listTaskRuns({ limit: 1 });
    expect(taskExecutor).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ _id: run._id }),
      auth: { userId: 'user-1', organizationId: null, role: null }
    }));
    expect(updated.status).toBe('SUCCEEDED');
    expect(updated.output.data).toEqual({ ok: true });
  });

  it('does not retry non-retryable executor errors', async () => {
    taskExecutor.mockImplementationOnce(async () => {
      const error = new Error('entity gone');
      error.statusCode = 404;
      throw error;
    });
    await enqueueTask('test.http', { parameters: {} }, { userId: 'user-1' });

    await dispatchRegisteredTaskExecutors({ workerId: 'spec-executor' });

    const [updated] = await listTaskRuns({ limit: 1 });
    expect(updated.status).toBe('FAILED');
    expect(updated.attempts).toBe(1);
    expect(updated.error.message).toBe('entity gone');
  });
});
