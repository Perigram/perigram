import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findConversationMessages: vi.fn(),
    findReadStates: vi.fn(),
    markRead: vi.fn(),
    insert: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findSince: vi.fn()
  },
  appRegistry: {
    getInstanceService: vi.fn(() => ({ processGetById: vi.fn(async () => null) }))
  },
  usersService: {
    getById: vi.fn(),
    list: vi.fn()
  },
  catalogsService: { list: vi.fn() },
  librariesService: { list: vi.fn() },
  projectsService: { list: vi.fn() },
  queuesService: { list: vi.fn() },
  materialPilesService: { list: vi.fn() },
  nestingRunsService: { list: vi.fn() },
  remnantsService: { list: vi.fn() },
  requisitionsService: { list: vi.fn() },
  sheetsService: { list: vi.fn() },
  materialsService: { list: vi.fn() },
  warehousesService: { list: vi.fn() },
  processRuntime: { resolveProcessAuth: vi.fn(async (auth) => auth) }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => mocks.appRegistry
}));
vi.mock('~/server/features/catalogs/service.js', () => mocks.catalogsService);
vi.mock('~/server/features/libraries/service.js', () => mocks.librariesService);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/projects/service.js', () => mocks.projectsService);
vi.mock('~/server/features/queues/service.js', () => mocks.queuesService);
vi.mock('~/server/features/material-piles/service.js', () => mocks.materialPilesService);
vi.mock('~/server/features/nesting-runs/service.js', () => mocks.nestingRunsService);
vi.mock('~/server/features/remnants/service.js', () => mocks.remnantsService);
vi.mock('~/server/features/requisitions/service.js', () => mocks.requisitionsService);
vi.mock('~/server/features/sheets/service.js', () => mocks.sheetsService);
vi.mock('~/server/features/materials/service.js', () => mocks.materialsService);
vi.mock('~/server/features/warehouses/service.js', () => mocks.warehousesService);
vi.mock('~/server/features/process-definitions/runtime.js', () => mocks.processRuntime);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as supportService from './service.js';
import * as connectionsService from '../connections/service.js';

const auth = {
  userId: 'user-a',
  organizationId: 'org-1',
  memberships: [{ organizationId: 'org-1' }]
};

describe('support realtime delivery over the connections layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionsService.__clearRegistryForTests();
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => input);
  });

  it('delivers a sent message to the authorized conversation subscriber', async () => {
    mocks.repository.insert.mockImplementation(async (record) => ({ ...record, _id: 'm1' }));

    const events = [];
    const registration = await connectionsService.registerConnection({
      auth,
      push: data => events.push(JSON.parse(data))
    });

    const subscription = await connectionsService.syncTopics(registration.id, ['conversation:support:user-a']);
    expect(subscription.subscribed).toContain('conversation:support:user-a');

    const message = await supportService.sendUserMessage(auth, { message: 'hello' });
    expect(message.message).toBe('hello');

    const delivered = events.find(entry =>
      entry.topic === 'conversation:support:user-a' && entry.payload?.type === 'message');
    expect(delivered).toBeTruthy();
    expect(delivered.payload.message.message).toBe('hello');

    const inbox = events.find(entry =>
      entry.topic === 'user:user-a' && entry.payload?.type === 'support.inbox');
    expect(inbox).toBeTruthy();

    await connectionsService.unregisterConnection(registration.id);
  });

  it('denies conversation subscriptions to outsiders', async () => {
    const outsider = await connectionsService.registerConnection({
      auth: { userId: 'user-b', organizationId: 'org-1' },
      push: () => {}
    });
    const subscription = await connectionsService.syncTopics(outsider.id, ['conversation:support:user-a']);
    expect(subscription.subscribed).not.toContain('conversation:support:user-a');
    await connectionsService.unregisterConnection(outsider.id);
  });

  it('publishes typing signals without persisting them', async () => {
    mocks.repository.markRead.mockResolvedValue({ conversationKey: 'support:user-a', userId: 'user-a' });

    const events = [];
    const registration = await connectionsService.registerConnection({
      auth,
      push: data => events.push(JSON.parse(data))
    });
    await connectionsService.syncTopics(registration.id, ['conversation:support:user-a']);

    await supportService.notifyTyping(auth, 'support:user-a');

    expect(mocks.repository.insert).not.toHaveBeenCalled();
    const typing = events.find(entry =>
      entry.topic === 'conversation:support:user-a' && entry.payload?.type === 'typing');
    expect(typing).toBeTruthy();
    expect(typing.payload.userId).toBe('user-a');

    await connectionsService.unregisterConnection(registration.id);
  });
});
