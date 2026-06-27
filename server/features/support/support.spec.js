import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findConversationMessages: vi.fn(),
    findReadStates: vi.fn(),
    markRead: vi.fn(),
    insert: vi.fn(),
    find: vi.fn(),
    findSince: vi.fn()
  },
  usersService: {
    getById: vi.fn(),
    list: vi.fn()
  },
  projectsService: { list: vi.fn() },
  queuesService: { list: vi.fn() },
  sheetsService: { list: vi.fn() },
  materialsService: { list: vi.fn() }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/projects/service.js', () => mocks.projectsService);
vi.mock('~/server/features/queues/service.js', () => mocks.queuesService);
vi.mock('~/server/features/sheets/service.js', () => mocks.sheetsService);
vi.mock('~/server/features/materials/service.js', () => mocks.materialsService);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as supportService from './service.js';

const auth = {
  userId: 'user-a',
  organizationId: 'org-1',
  memberships: [{ organizationId: 'org-1' }]
};

describe('support communication service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves deterministic direct conversation context for same-organization users', async () => {
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const context = await supportService.getUserConversationContext(auth, 'user-b');

    expect(context).toMatchObject({
      kind: 'direct',
      conversationKey: 'direct:user-a:user-b',
      participants: ['user-a', 'user-b']
    });
  });

  it('builds user conversation unread counts from read cursors', async () => {
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'direct:user-a:user-b',
        conversationKind: 'direct',
        participants: ['user-a', 'user-b'],
        message: 'new',
        senderUserId: 'user-b',
        timestamp: new Date('2026-06-27T10:00:00.000Z')
      },
      {
        conversationKey: 'direct:user-a:user-b',
        conversationKind: 'direct',
        participants: ['user-a', 'user-b'],
        message: 'old',
        senderUserId: 'user-b',
        timestamp: new Date('2026-06-27T08:00:00.000Z')
      },
      {
        conversationKey: 'support:user-a',
        conversationKind: 'support',
        participants: ['user-a'],
        message: 'mine',
        senderUserId: 'user-a',
        timestamp: new Date('2026-06-27T09:00:00.000Z')
      }
    ]);
    mocks.repository.findReadStates.mockResolvedValue([
      { conversationKey: 'direct:user-a:user-b', lastReadAt: new Date('2026-06-27T09:00:00.000Z') }
    ]);
    mocks.usersService.getById.mockResolvedValue({
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });
    mocks.usersService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'user-a', identity: { name: 'User A' }, data: {} }) },
      { toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} }) },
      { toJSON: () => ({ _id: 'user-c', identity: { name: 'User C' }, data: {} }) }
    ]);

    const conversations = await supportService.listUserConversations(auth);

    expect(conversations.find(item => item.conversationKey === 'direct:user-a:user-b')).toMatchObject({
      lastMessage: 'new',
      unreadCount: 1,
      participant: { _id: 'user-b' }
    });
    expect(conversations.find(item => item.conversationKey === 'support:user-a')).toMatchObject({
      unreadCount: 0
    });
    expect(conversations.find(item => item.conversationKey === 'direct:user-a:user-c')).toMatchObject({
      lastMessage: '',
      unreadCount: 0,
      participant: { _id: 'user-c' }
    });
  });

  it('marks only authorized conversation keys as read', async () => {
    mocks.repository.markRead.mockResolvedValue({ conversationKey: 'support:user-a', userId: 'user-a' });

    await supportService.markConversationRead(auth, { conversationKey: 'support:user-a' });

    expect(mocks.repository.markRead).toHaveBeenCalledWith('support:user-a', 'user-a');
    await expect(supportService.markConversationRead(auth, { conversationKey: 'support:user-b' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns readable entity options for supported attachment types', async () => {
    mocks.projectsService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'project-1', identity: { name: 'Facade Alpha' }, data: {} }) },
      { toJSON: () => ({ _id: 'project-2', identity: { name: 'Interior Beta' }, data: {} }) }
    ]);

    const options = await supportService.listEntityOptions(auth, 'project', 'facade');

    expect(options).toEqual([
      {
        type: 'project',
        value: 'project-1',
        label: 'Facade Alpha',
        entity: { _id: 'project-1', identity: { name: 'Facade Alpha' }, data: {} }
      }
    ]);
  });
});
