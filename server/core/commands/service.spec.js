import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const {
  definitions,
  instanceServices,
  handler,
  processEventsMock,
  processEffectsMock,
  resolveProcessCommandService,
  mockedConnectDB
} = vi.hoisted(() => ({
  definitions: new Map(),
  instanceServices: new Map(),
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
    getCommandHandler: id => definitions.get(id)?.plugin ? null : handler,
    getInstanceService: type => instanceServices.get(type) || null,
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

vi.mock('../../features/plugins/service.js', () => ({
  executeConnectorService: vi.fn(),
  commandDefinitionFor: vi.fn(async () => null)
}));

vi.mock('../../features/billing/service.js', () => ({
  assertSufficientServiceTokens: vi.fn(),
  debitServiceTokens: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import * as service from './service.js';
import { executeConnectorService } from '../../features/plugins/service.js';

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
    instanceServices.clear();
    definitions.set('run_thing', {
      id: 'run_thing',
      service: 'thing',
      action: 'run',
      input: { entities: [], parameters: [] },
      output: {}
    });
    handler.mockReset();
    executeConnectorService.mockReset();
    processEventsMock.mockReset().mockResolvedValue(emptyProcessed());
    processEffectsMock.mockReset().mockResolvedValue(emptyProcessed());
    resolveProcessCommandService.mockReset().mockResolvedValue({ processActive: false, gated: false, service: null });
    await db.dropDatabase();
  });

  it('authorizes each entity input through its process read boundary before invoking the handler', async () => {
    const readEntity = vi.fn(async (id, passedAuth) => {
      expect(id).toBe('private-1');
      expect(passedAuth).toBe(auth);
      throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
    });
    instanceServices.set('thing', { processGetById: readEntity });
    definitions.set('read_thing', {
      id: 'read_thing',
      service: 'thing',
      action: 'read',
      input: { entities: [{ name: 'source', type: 'thing', required: true }], parameters: [] },
      output: {},
      access: { permissions: [] }
    });

    await expect(service.executeCommand('read_thing', {
      entities: { source: 'private-1' }
    }, auth)).rejects.toMatchObject({ statusCode: 403 });

    expect(readEntity).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('treats plugin endpoint output as an opaque value, never as platform effects', async () => {
    const pluginOutput = {
      effects: [{ type: 'createEntity', entity: { type: 'project' }, data: { name: 'Injected' } }],
      events: [{ type: 'forged.event' }],
      entities: [{ type: 'project', id: 'forged-id' }]
    };
    definitions.set('plugin.docs.run', {
      id: 'plugin.docs.run',
      service: 'plugin.docs',
      action: 'run',
      plugin: true,
      input: { entities: [], parameters: [] },
      output: {}
    });
    executeConnectorService.mockResolvedValue({
      __perigramPluginValue: true,
      value: pluginOutput
    });

    const result = await service.executeCommand('plugin.docs.run', {}, auth);

    expect(result.raw).toBe(pluginOutput);
    expect(result.effects).toEqual(emptyProcessed());
    expect(processEffectsMock).toHaveBeenCalledWith([], expect.objectContaining({ auth }));
    expect(executeConnectorService).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plugin.docs.run' }),
      expect.objectContaining({ auth, valueOnly: true })
    );
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

  it('scopes command-run history to the requested organization', async () => {
    await repository.create({
      commandId: 'run_thing',
      status: 'SUCCEEDED',
      auth: { userId: 'u1', organizationId: 'org-a' },
      createdAt: new Date()
    });
    await repository.create({
      commandId: 'run_thing',
      status: 'SUCCEEDED',
      auth: { userId: 'u2', organizationId: 'org-b' },
      createdAt: new Date()
    });

    const runs = await service.listCommandRuns({ organizationId: 'org-a' });
    expect(runs).toHaveLength(1);
    expect(runs[0].auth.organizationId).toBe('org-a');
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
