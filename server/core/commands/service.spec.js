import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const {
  definitions,
  handler,
  processEventsMock,
  processEffectsMock,
  resolveProcessCommandService,
  mockedConnectDB
} = vi.hoisted(() => ({
  definitions: new Map(),
  handler: vi.fn(),
  processEventsMock: vi.fn(),
  processEffectsMock: vi.fn(),
  resolveProcessCommandService: vi.fn(),
  mockedConnectDB: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({ connectDB: mockedConnectDB }));

vi.mock('../../runtime/app-registry.js', () => ({
  getAppRegistry: () => ({
    getCommandDefinition: id => definitions.get(id) || null,
    getCommandHandler: () => handler,
    getInstanceService: () => null,
    listCommandDefinitions: () => [...definitions.values()]
  })
}));

vi.mock('../access/service.js', () => ({ assertCommandAccess: vi.fn() }));

vi.mock('../effects/service.js', () => ({
  processEvents: processEventsMock,
  processEffects: processEffectsMock,
  mergeProcessedEffects: (left = {}, right = {}) => {
    const keys = ['entities', 'tasks', 'transitions', 'events', 'attachments'];
    return Object.fromEntries(keys.map(key => [key, [...(left[key] || []), ...(right[key] || [])]]));
  }
}));

vi.mock('../../features/process-definitions/runtime.js', () => ({ resolveProcessCommandService }));

vi.mock('../../features/billing/service.js', () => ({
  assertSufficientServiceTokens: vi.fn(),
  debitServiceTokens: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import * as service from './service.js';

const emptyProcessed = () => ({ entities: [], tasks: [], transitions: [], events: [], attachments: [] });

const auth = {
  userId: 'user-1',
  organizationId: '665000000000000000000001'
};

describe('command run transitions', () => {
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
    definitions.set('run_thing', {
      id: 'run_thing',
      service: 'thing',
      action: 'run',
      input: { entities: [], parameters: [] },
      output: {}
    });
    handler.mockReset();
    processEventsMock.mockReset().mockResolvedValue(emptyProcessed());
    processEffectsMock.mockReset().mockResolvedValue(emptyProcessed());
    resolveProcessCommandService.mockReset().mockResolvedValue({ processActive: false, gated: false, service: null });
    await db.dropDatabase();
  });

  it('settles a successful command run as SUCCEEDED with a finish stamp', async () => {
    handler.mockResolvedValue({ data: { ok: true } });

    await service.executeCommand('run_thing', {}, auth);

    const run = await repository.list({ commandId: 'run_thing' });
    expect(run).toHaveLength(1);
    expect(run[0].status).toBe('SUCCEEDED');
    expect(run[0].finishedAt).toBeInstanceOf(Date);
  });

  it('settles a failing command run as FAILED with the error and a finish stamp', async () => {
    handler.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 400 }));

    await expect(service.executeCommand('run_thing', {}, auth)).rejects.toMatchObject({ statusCode: 400 });

    const run = await repository.list({ commandId: 'run_thing' });
    expect(run[0].status).toBe('FAILED');
    expect(run[0].error).toMatchObject({ message: 'nope', statusCode: 400 });
    expect(run[0].finishedAt).toBeInstanceOf(Date);
  });

  it('marks a stale RUNNING run FAILED with abandoned context at startup', async () => {
    const stale = await repository.create({
      commandId: 'run_thing',
      service: 'thing',
      action: 'run',
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 60 * 60 * 1000)
    });
    const live = await repository.create({
      commandId: 'run_thing',
      service: 'thing',
      action: 'run',
      status: 'RUNNING',
      startedAt: new Date()
    });
    const succeeded = await repository.create({
      commandId: 'run_thing',
      service: 'thing',
      action: 'run',
      status: 'SUCCEEDED',
      finishedAt: new Date()
    });

    await expect(service.recoverAbandonedCommandRuns()).resolves.toEqual({ abandoned: 1 });

    const recovered = await repository.findById(stale._id);
    expect(recovered.status).toBe('FAILED');
    expect(recovered.error).toMatchObject({ reason: 'abandoned' });
    expect(recovered.finishedAt).toBeInstanceOf(Date);

    const untouched = await repository.findById(succeeded._id);
    expect(untouched.status).toBe('SUCCEEDED');
    expect(untouched.error).toBeUndefined();
    expect((await repository.findById(live._id)).status).toBe('RUNNING');
  });
});
