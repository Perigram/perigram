import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectionsPublish: vi.fn(),
  repository: {
    findConversationMessages: vi.fn(),
    findReadStates: vi.fn(),
    markRead: vi.fn(),
    findConversationPrefs: vi.fn(async () => []),
    upsertConversationPref: vi.fn(),
    findOthersReadStates: vi.fn(async () => []),
    insert: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findSince: vi.fn(),
    insertGroup: vi.fn(),
    findGroupById: vi.fn(),
    findGroupsByParticipant: vi.fn(async () => []),
    deleteGroupById: vi.fn()
  },
  appRegistry: {
    getEntityService: vi.fn(() => ({ processGetById: vi.fn(async () => null) }))
  },
  usersService: {
    getById: vi.fn(),
    list: vi.fn()
  },
  cassetteDesignsService: { list: vi.fn() },
  cassettesService: { list: vi.fn() },
  artifactsService: { list: vi.fn() },
  catalogsService: { list: vi.fn() },
  librariesService: { list: vi.fn() },
  projectsService: { list: vi.fn() },
  queuesService: { list: vi.fn() },
  materialPilesService: { list: vi.fn() },
  nestingRunsService: { list: vi.fn() },
  remnantsService: { list: vi.fn() },
  requisitionsService: { list: vi.fn() },
  sheetDesignsService: { list: vi.fn() },
  sheetsService: { list: vi.fn() },
  materialsService: { list: vi.fn() },
  warehousesService: { list: vi.fn() },
  processRuntime: { resolveProcessAuth: vi.fn(async (auth) => auth) }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => mocks.appRegistry
}));
vi.mock('~/server/features/connections/service.js', () => ({
  publish: mocks.connectionsPublish,
  registerTopicAuthorizer: vi.fn()
}));
vi.mock('~/server/features/cassette-designs/service.js', () => mocks.cassetteDesignsService);
vi.mock('~/server/features/cassettes/service.js', () => mocks.cassettesService);
vi.mock('~/server/features/artifacts/service.js', () => mocks.artifactsService);
vi.mock('~/server/features/catalogs/service.js', () => mocks.catalogsService);
vi.mock('~/server/features/libraries/service.js', () => mocks.librariesService);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/projects/service.js', () => mocks.projectsService);
vi.mock('~/server/features/queues/service.js', () => mocks.queuesService);
vi.mock('~/server/features/material-piles/service.js', () => mocks.materialPilesService);
vi.mock('~/server/features/nesting-runs/service.js', () => mocks.nestingRunsService);
vi.mock('~/server/features/remnants/service.js', () => mocks.remnantsService);
vi.mock('~/server/features/requisitions/service.js', () => mocks.requisitionsService);
vi.mock('~/server/features/sheet-designs/service.js', () => mocks.sheetDesignsService);
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

const auth = {
  userId: 'user-a',
  organizationId: 'org-1',
  memberships: [{ organizationId: 'org-1' }]
};

describe('support communication service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => input);
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

  it('resolves an explicit self recipient as a direct self conversation', async () => {
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-a', identity: { name: 'User A' }, data: {} })
    });

    await expect(supportService.getUserConversationContext(auth, 'user-a')).resolves.toMatchObject({
      kind: 'direct',
      conversationKey: 'direct:user-a:user-a',
      participants: ['user-a'],
      recipient: { _id: 'user-a' }
    });
  });

  it('builds user conversation unread counts from read cursors', async () => {
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'direct:user-a:user-b',
        conversationKind: 'direct',
        participants: ['user-a', 'user-b'],
        message: 'new',
        entityRefs: [{ type: 'queue', id: 'queue-1', label: 'Queue 1' }],
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
    const conversations = await supportService.listUserConversations(auth);

    expect(conversations.find(item => item.conversationKey === 'direct:user-a:user-b')).toMatchObject({
      lastMessage: 'new',
      entityRefs: [{ type: 'queue', id: 'queue-1', label: 'Queue 1' }],
      unreadCount: 1,
      participant: { _id: 'user-b' }
    });
    expect(conversations.find(item => item.conversationKey === 'support:user-a')).toMatchObject({
      unreadCount: 0
    });
    expect(conversations.find(item => item.conversationKey === 'direct:user-a:user-c')).toBeUndefined();
  });

  it('decorates inbox rows with pin/archive prefs and the own-last read mark', async () => {
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'direct:user-a:user-b',
        conversationKind: 'direct',
        participants: ['user-a', 'user-b'],
        message: 'read me',
        senderUserId: 'user-a',
        timestamp: new Date('2026-06-27T10:00:00.000Z')
      },
      {
        conversationKey: 'support:user-a',
        conversationKind: 'support',
        participants: ['user-a'],
        message: 'unread support',
        senderUserId: 'user-b',
        timestamp: new Date('2026-06-27T10:00:00.000Z')
      }
    ]);
    mocks.repository.findConversationPrefs.mockResolvedValue([
      { conversationKey: 'direct:user-a:user-b', pinnedAt: new Date('2026-06-26T00:00:00.000Z') }
    ]);
    mocks.repository.findOthersReadStates.mockResolvedValue([
      { conversationKey: 'direct:user-a:user-b', lastReadAt: new Date('2026-06-27T10:30:00.000Z') }
    ]);
    mocks.usersService.getById.mockResolvedValue({
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });
    const conversations = await supportService.listUserConversations(auth);

    expect(conversations.find(item => item.conversationKey === 'direct:user-a:user-b')).toMatchObject({
      pinned: true,
      archived: false,
      lastMessageRead: true
    });
    expect(conversations.find(item => item.conversationKey === 'support:user-a')).toMatchObject({
      pinned: false,
      archived: false,
      lastMessageRead: false
    });
  });

  it('updates per-user conversation prefs through validated keys', async () => {
    mocks.repository.upsertConversationPref.mockResolvedValue({
      conversationKey: 'direct:user-a:user-b',
      pinnedAt: new Date('2026-06-27T00:00:00.000Z'),
      archivedAt: null
    });

    await expect(supportService.updateConversationPrefs(auth, {
      conversationKey: 'direct:user-a:user-b',
      pinned: true
    })).resolves.toMatchObject({ conversationKey: 'direct:user-a:user-b', pinned: true, archived: false });
    expect(mocks.repository.upsertConversationPref).toHaveBeenCalledWith(
      'user-a',
      'direct:user-a:user-b',
      { pinned: true }
    );
    await expect(supportService.updateConversationPrefs(auth, { conversationKey: 'bogus-key' }))
      .rejects.toMatchObject({ statusCode: 400 });
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

  it('derives composer attachment types from generated screen sources', async () => {
    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        queues: [{ level: 'read' }],
        projects: [{ level: 'none' }]
      },
      screens: [{
        id: 'queue_screen',
        screenKey: 'queue_screen',
        sources: [{
          id: 'queue',
          typeId: 'queue',
          label: 'My Queues',
          mode: 'list',
          required: { feature: 'queues', level: 'read' }
        }, {
          id: 'project',
          typeId: 'project',
          label: 'Blocked Projects',
          mode: 'list',
          required: { feature: 'projects', level: 'read' }
        }, {
          id: 'external_record',
          typeId: 'external_record',
          label: 'Readable External Records',
          mode: 'list',
          required: { feature: 'queues', level: 'read' }
        }]
      }]
    };

    await expect(supportService.listEntityOptionTypes(processAuth)).resolves.toEqual([
      { value: 'queue', label: 'My Queues', labelKey: null, sourceId: 'queue', screenKey: 'queue_screen' },
      { value: 'external_record', label: 'Readable External Records', labelKey: null, sourceId: 'external_record', screenKey: 'queue_screen' }
    ]);
  });

  it('resolves sender process auth before deriving attachment types and options', async () => {
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {
        nesting_runs: [{ level: 'read' }]
      },
      screens: [{
        id: 'nesting_run_list',
        screenKey: 'nesting_run_list',
        sources: [{
          id: 'nesting_run',
          typeId: 'nesting_run',
          mode: 'list',
          label: 'Process Runs',
          required: {
            feature: 'nesting_runs',
            level: 'read',
            rule: { fact: 'primaryStatus', equals: 'CUT' }
          }
        }]
      }]
    }));
    mocks.nestingRunsService.list.mockResolvedValue([
      { _id: 'run-1', identity: { name: 'Run From Process Auth' }, data: {} }
    ]);

    await expect(supportService.listEntityOptionTypes(auth)).resolves.toEqual([
      { value: 'nesting_run', label: 'Process Runs', labelKey: null, sourceId: 'nesting_run', screenKey: 'nesting_run_list' }
    ]);

    await expect(supportService.listEntityOptions(auth, 'nesting_run', 'process')).resolves.toEqual([
      {
        type: 'nesting_run',
        value: 'run-1',
        label: 'Run From Process Auth',
        entity: { _id: 'run-1', identity: { name: 'Run From Process Auth' }, data: {} }
      }
    ]);
    expect(mocks.nestingRunsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, expect.objectContaining({
      process: { active: true }
    }), { primaryStatus: 'CUT' });
  });

  it('loads concrete options for generated readable entity sources', async () => {
    mocks.cassetteDesignsService.list.mockResolvedValue([
      { _id: 'design-1', identity: { name: 'Design Alpha' }, data: {} }
    ]);
    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        cassette_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'design_screen',
        sources: [{
          id: 'cassette_design',
          typeId: 'cassette_design',
          label: 'Cassette Designs',
          required: { feature: 'cassette_designs', level: 'read' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'cassette_design', 'alpha');

    expect(mocks.cassetteDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, {});
    expect(options).toEqual([
      {
        type: 'cassette_design',
        value: 'design-1',
        label: 'Design Alpha',
        entity: { _id: 'design-1', identity: { name: 'Design Alpha' }, data: {} }
      }
    ]);
  });

  it('resolves parent-scoped generated filters for chat entity options', async () => {
    mocks.queuesService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'queue-1', identity: { name: 'Queue 1' }, data: {} }) },
      { toJSON: () => ({ _id: 'queue-2', identity: { name: 'Queue 2' }, data: {} }) }
    ]);
    mocks.nestingRunsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
      if (filters?.queueId === 'queue-1') return [{ _id: 'run-1', identity: { name: 'Run Alpha' }, data: {} }];
      if (filters?.queueId === 'queue-2') return [{ _id: 'run-2', identity: { name: 'Run Beta' }, data: {} }];
      return [];
    });
    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        queues: [{ level: 'read' }],
        nesting_runs: [{ level: 'read' }]
      },
      screens: [{
        id: 'queue_list',
        typeId: 'queue',
        sources: [{
          id: 'queue',
          typeId: 'queue',
          required: { feature: 'queues', level: 'read' },
          filters: { primaryStatus: 'READY' }
        }]
      }, {
        id: 'queue_detail',
        typeId: 'queue',
        sources: [{
          id: 'nesting_run_children',
          typeId: 'nesting_run',
          required: { feature: 'nesting_runs', level: 'read' },
          filters: { queueId: '$screen.scope.entityId' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'nesting_run', 'run');

    expect(mocks.queuesService.list).toHaveBeenCalledWith({ primaryStatus: 'READY' }, 'user-a', 'org-1', undefined, processAuth);
    expect(mocks.nestingRunsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-1' });
    expect(mocks.nestingRunsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-2' });
    expect(options).toEqual([
      {
        type: 'nesting_run',
        value: 'run-1',
        label: 'Run Alpha',
        entity: { _id: 'run-1', identity: { name: 'Run Alpha' }, data: {} }
      },
      {
        type: 'nesting_run',
        value: 'run-2',
        label: 'Run Beta',
        entity: { _id: 'run-2', identity: { name: 'Run Beta' }, data: {} }
      }
    ]);
  });

  it('uses the first generated source exposed for an attachment entity type', async () => {
    mocks.nestingRunsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
      if (filters?.queueId === 'queue-1') return [{ _id: 'run-1', identity: { name: 'Run From Queue' }, data: {} }];
      if (filters?.primaryStatus === 'CUT') return [{ _id: 'run-2', identity: { name: 'Run From List' }, data: {} }];
      return [];
    });
    mocks.queuesService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'queue-1', identity: { name: 'Queue 1' }, data: {} }) }
    ]);

    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        queues: [{ level: 'read' }],
        nesting_runs: [{ level: 'read' }]
      },
      screens: [{
        id: 'queue_list',
        typeId: 'queue',
        sources: [{
          id: 'queue',
          typeId: 'queue',
          required: { feature: 'queues', level: 'read' }
        }]
      }, {
        id: 'queue_detail',
        typeId: 'queue',
        sources: [{
          id: 'nesting_run_children',
          typeId: 'nesting_run',
          required: { feature: 'nesting_runs', level: 'read' },
          filters: { queueId: '$screen.scope.entityId' }
        }]
      }, {
        id: 'nesting_run_list',
        typeId: 'nesting_run',
        sources: [{
          id: 'nesting_run',
          typeId: 'nesting_run',
          required: {
            feature: 'nesting_runs',
            level: 'read',
            rule: { fact: 'primaryStatus', equals: 'CUT' }
          }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'nesting_run', 'run');

    expect(options).toEqual([
      {
        type: 'nesting_run',
        value: 'run-1',
        label: 'Run From Queue',
        entity: { _id: 'run-1', identity: { name: 'Run From Queue' }, data: {} }
      }
    ]);
    expect(mocks.nestingRunsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-1' });
    expect(mocks.nestingRunsService.list).not.toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { primaryStatus: 'CUT' });
  });

  it('ignores generated single-entity sources when loading attachment options', async () => {
    mocks.nestingRunsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
      if (filters?.primaryStatuses === 'CUT,SHIPPED') return [{ _id: 'run-1', identity: { name: 'Run From List' }, data: {} }];
      if (Object.keys(filters || {}).length === 0) return [{ _id: 'run-2', identity: { name: 'Run From Detail' }, data: {} }];
      return [];
    });

    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        nesting_runs: [{ level: 'read' }]
      },
      screens: [{
        id: 'nesting_run_list',
        typeId: 'nesting_run',
        sources: [{
          id: 'nesting_run',
          typeId: 'nesting_run',
          mode: 'list',
          required: {
            feature: 'nesting_runs',
            level: 'read',
            rule: { any: [{ fact: 'primaryStatus', equals: 'CUT' }, { fact: 'primaryStatus', equals: 'SHIPPED' }] }
          }
        }]
      }, {
        id: 'nesting_run_detail',
        typeId: 'nesting_run',
        sources: [{
          id: 'nesting_run',
          typeId: 'nesting_run',
          mode: 'single',
          required: { feature: 'nesting_runs', level: 'read' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'nesting_run', 'run');

    expect(mocks.nestingRunsService.list).toHaveBeenCalledTimes(1);
    expect(mocks.nestingRunsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, {
      primaryStatuses: 'CUT,SHIPPED'
    });
    expect(options).toEqual([
      {
        type: 'nesting_run',
        value: 'run-1',
        label: 'Run From List',
        entity: { _id: 'run-1', identity: { name: 'Run From List' }, data: {} }
      }
    ]);
  });

  it('marks attachment options that the direct recipient can only view in chat', async () => {
    mocks.projectsService.list.mockImplementation(async (userId) => {
      if (userId === 'user-b') return [];
      return [{ toJSON: () => ({ _id: 'project-1', identity: { name: 'Facade Alpha' }, data: {} }) }];
    });
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({
        _id: 'user-b',
        identity: { name: 'User B' },
        lineage: { organizationId: 'org-1' },
        data: { role: 'USER', permissions: {}, memberships: [{ organizationId: 'org-1' }] }
      })
    });

    const options = await supportService.listEntityOptions(auth, 'project', 'facade', 'user-b');

    expect(options).toEqual([
      {
        type: 'project',
        value: 'project-1',
        label: 'Facade Alpha',
        entity: { _id: 'project-1', identity: { name: 'Facade Alpha' }, data: {} },
        recipientHasAccess: false
      }
    ]);
  });

  it('persists chat-only recipient metadata and entity snapshots on direct message refs', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.projectsService.list.mockImplementation(async (userId) => {
      if (userId === 'user-b') return [];
      return [{ toJSON: () => ({ _id: 'project-1', identity: { name: 'Facade Alpha' }, data: {} }) }];
    });
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({
        _id: 'user-b',
        identity: { name: 'User B' },
        lineage: { organizationId: 'org-1' },
        data: { role: 'USER', permissions: {}, memberships: [{ organizationId: 'org-1' }] }
      })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'Please review',
      entityRefs: [{ type: 'project', id: 'project-1' }]
    });

    expect(message.entityRefs).toEqual([
      {
        type: 'project',
        id: 'project-1',
        label: 'Facade Alpha',
        entity: {
          _id: 'project-1',
          identity: { name: 'Facade Alpha' },
          lineage: {},
          origin: null,
          status: null,
          specs: null,
          attachments: {},
          summary: {},
          data: {}
        },
        chatOnlyForRecipient: true
      }
    ]);
  });

  it('keeps cassette preview fields in compact chat entity snapshots', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.cassettesService.list.mockResolvedValue([
      {
        toJSON: () => ({
          _id: 'cassette-1',
          identity: { name: 'Iklya 1' },
          lineage: { organizationId: 'org-1' },
          data: {
            type: 'STANDARD',
            definition: { params: { A: 1 } },
            revisions: { geometry: null }
          }
        })
      }
    ]);

    const message = await supportService.sendUserMessage(auth, {
      message: 'Preview',
      entityRefs: [{ type: 'cassette', id: 'cassette-1' }]
    });

    expect(message.entityRefs).toEqual([
      expect.objectContaining({
        type: 'cassette',
        id: 'cassette-1',
        entity: expect.objectContaining({
          _id: 'cassette-1',
          data: expect.objectContaining({
            type: 'STANDARD',
            definition: { params: { A: 1 } },
            revisions: { geometry: null }
          })
        })
      })
    ]);
  });

  it('normalizes frontend entity type aliases before validating sent refs', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.cassetteDesignsService.list.mockResolvedValue([
      {
        toJSON: () => ({
          _id: 'design-1',
          identity: { name: 'Design 1' },
          data: {}
        })
      }
    ]);

    const message = await supportService.sendUserMessage(auth, {
      message: 'Alias',
      entityRefs: [{ type: 'cassetteDesign', id: 'design-1' }]
    });

    expect(message.entityRefs).toEqual([
      expect.objectContaining({
        type: 'cassette_design',
        id: 'design-1',
        label: 'Design 1'
      })
    ]);
  });

  it('allows attachment-only messages when at least one ref survives validation', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.cassettesService.list.mockResolvedValue([
      {
        toJSON: () => ({
          _id: 'cassette-1',
          identity: { name: 'Iklya 1' },
          data: {}
        })
      }
    ]);

    const message = await supportService.sendUserMessage(auth, {
      message: '   ',
      entityRefs: [{ type: 'cassette', id: 'cassette-1' }]
    });

    expect(message.message).toBe('');
    expect(message.entityRefs).toEqual([
      expect.objectContaining({
        type: 'cassette',
        id: 'cassette-1',
        label: 'Iklya 1'
      })
    ]);
  });

  it('paginates conversation history through a before cursor and limit', async () => {
    mocks.repository.find.mockResolvedValue([]);

    await supportService.listMessages(
      { conversationKey: 'direct:user-a:user-b' },
      { limit: 25, before: '2026-09-16T00:00:00.000Z' }
    );

    expect(mocks.repository.find).toHaveBeenCalledWith(
      { conversationKey: 'direct:user-a:user-b' },
      expect.any(Object),
      { limit: 25, before: '2026-09-16T00:00:00.000Z' }
    );
  });

  it('sends voice messages as attachment-only payloads referencing uploaded files', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: '   ',
      attachment: { kind: 'audio', fileId: 'gridfs-1', mimeType: 'audio/webm', durationSeconds: 12 }
    });

    expect(message.message).toBe('');
    expect(message.attachment).toEqual({
      kind: 'audio',
      fileId: 'gridfs-1',
      mimeType: 'audio/webm',
      durationSeconds: 12
    });
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:direct:user-a:user-b',
      expect.objectContaining({ type: 'message' })
    );
  });

  it('rejects unsupported chat attachment kinds', async () => {
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    await expect(supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      attachment: { kind: 'video', fileId: 'gridfs-1' }
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows artifact refs when the process exposes an artifact creation action', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    const artifact = {
      toJSON: () => ({ _id: 'artifact-1', identity: { name: 'Scan' }, lineage: { organizationId: 'org-1' }, data: {} })
    };
    mocks.artifactsService.list.mockResolvedValue([artifact]);
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {},
      screens: [],
      roleAssignments: {
        actions: [{
          actionKind: 'createEntity',
          construction: {
            inputs: [{
              creator: {
                typeId: 'artifact',
                attachmentKinds: [{ kind: 'CAPTURE_PHOTO', creation: { mode: 'capture' } }]
              }
            }]
          }
        }]
      }
    }));
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      entityRefs: [{ type: 'artifact', id: 'artifact-1' }]
    });

    expect(message.entityRefs).toEqual([
      expect.objectContaining({
        type: 'artifact',
        id: 'artifact-1',
        label: 'Scan'
      })
    ]);
  });

  it('keeps artifacts unattachable in a process without an artifact creation action', async () => {
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {},
      screens: [],
      roleAssignments: { actions: [] }
    }));
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'no artifacts here',
      entityRefs: [{ type: 'artifact', id: 'artifact-1' }]
    });

    expect(message.entityRefs).toEqual([]);
  });

  it('tolerates non-array attachment-kind shapes on creator actions instead of failing', async () => {
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {},
      screens: [],
      roleAssignments: {
        actions: [{
          actionKind: 'createEntity',
          typeId: 'artifact',
          construction: {
            inputs: [{ id: 'artifact', creator: { typeId: 'artifact', attachmentKinds: 'userCreatable' } }]
          }
        }]
      }
    }));
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    // Regression: a manifest whose creator kinds were not expanded by the
    // compiler must degrade to "no creator credit", not throw a 500 that
    // takes down type-ids, entity-options, and every message send.
    await expect(supportService.listEntityOptionTypes(auth)).resolves.toEqual([]);
    await expect(supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'unexpanded kinds must not break sends'
    })).resolves.toBeTruthy();
  });
  it('resolves entity conversation contexts through the scoped registry read', async () => {
    mocks.appRegistry.getEntityService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => (type === 'project' && id === 'project-1'
        ? { toJSON: () => ({ _id: 'project-1', identity: { name: 'Facade Alpha' }, lineage: { organizationId: 'org-1' } }) }
        : null))
    }));

    const context = await supportService.getEntityConversationContext(auth, 'entity:project:project-1');

    expect(context).toMatchObject({
      kind: 'entity',
      conversationKey: 'entity:project:project-1',
      typeId: 'project',
      entityName: 'Facade Alpha',
      organizationId: 'org-1'
    });
    await expect(supportService.getEntityConversationContext(auth, 'entity:project:missing'))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(supportService.getEntityConversationContext(auth, 'entity:project'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves child-entity contexts through the scoped option window', async () => {
    // Direct registry reads deny cassettes; the scoped list window the
    // picker browses still returns them, and the chat context follows it.
    mocks.appRegistry.getEntityService.mockImplementation((type) => ({
      processGetById: vi.fn(async () => (type === 'cassette'
        ? null
        : { toJSON: () => ({ _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }) }))
    }));
    mocks.cassettesService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'cassette-1', identity: { name: 'Iklya' }, lineage: { organizationId: 'org-1', libraryId: 'library-1' }, data: {} }) }
    ]);

    const context = await supportService.getEntityConversationContext({
      ...auth,
      process: { active: true, lineageBindings: [] },
      screens: [{
        id: 'library_detail',
        sources: [{ id: 'cassette', typeId: 'cassette', mode: 'list' }]
      }],
      effectivePermissions: {}
    }, 'entity:cassette:cassette-1');

    expect(context).toMatchObject({
      kind: 'entity',
      conversationKey: 'entity:cassette:cassette-1',
      entityName: 'Iklya'
    });
  });

  it('composes aggregated entity views through the entity path', () => {
    const context = {
      typeId: 'organization',
      entityId: 'org-1',
      match: { conversationKey: 'entity:organization:org-1' }
    };
    expect(supportService.entityConversationMatch(context, true)).toEqual({
      entityPath: { $elemMatch: { type: 'organization', id: 'org-1' } }
    });
    expect(supportService.entityConversationMatch(context, false)).toEqual({
      conversationKey: 'entity:organization:org-1'
    });
  });

  it('links messages to entities with an ancestry path rooted at the organization', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    const table = {
      'queue:queue-1': { _id: 'queue-1', identity: { name: 'Queue 1' }, lineage: { organizationId: 'org-1', projectId: 'project-1' } },
      'project:project-1': { _id: 'project-1', identity: { name: 'Facade Alpha' }, lineage: { organizationId: 'org-1' } },
      'organization:org-1': { _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }
    };
    mocks.appRegistry.getEntityService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => {
        const dto = table[`${type}:${id}`];
        return dto ? { toJSON: () => dto } : null;
      })
    }));
    const entityAuth = {
      ...auth,
      process: { active: true, lineageBindings: [
        { childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }
      ] }
    };

    const message = await supportService.sendUserMessage(entityAuth, {
      entity: { type: 'queue', id: 'queue-1' },
      message: 'nested update'
    });

    expect(message.conversationKey).toBe('entity:queue:queue-1');
    expect(message.conversationKind).toBe('entity');
    expect(message.entityLink).toEqual({ type: 'queue', id: 'queue-1', name: 'Queue 1' });
    expect(message.entityPath).toEqual([
      { type: 'organization', id: 'org-1', name: 'Org1' },
      { type: 'project', id: 'project-1', name: 'Facade Alpha' },
      { type: 'queue', id: 'queue-1', name: 'Queue 1' }
    ]);
    expect(message.organizationId).toBe('org-1');
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:entity:organization:org-1',
      expect.objectContaining({ type: 'message' })
    );
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:entity:queue:queue-1',
      expect.objectContaining({ type: 'message' })
    );
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'org:org-1',
      expect.objectContaining({ type: 'support.inbox' })
    );
  });

  it('denormalizes quoted parents and accepts replies across the composed entity family', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.repository.findById.mockResolvedValue({
      _id: 'parent-1',
      conversationKey: 'entity:queue:queue-1',
      conversationKind: 'entity',
      organizationId: 'org-1',
      senderUserId: 'user-b',
      message: 'Original point that is long enough to quote',
      attachment: null,
      timestamp: new Date('2026-09-16T10:00:00.000Z')
    });
    mocks.usersService.getById.mockResolvedValue({
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });
    mocks.appRegistry.getEntityService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => (type === 'organization' && id === 'org-1'
        ? { toJSON: () => ({ _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }) }
        : null))
    }));

    const message = await supportService.sendUserMessage({ ...auth, process: { active: true, lineageBindings: [] } }, {
      entity: { type: 'organization', id: 'org-1' },
      message: 'replying at the top level',
      parentMessageId: 'parent-1'
    });

    expect(message.parent).toMatchObject({
      _id: 'parent-1',
      senderName: 'User B',
      snippet: 'Original point that is long enough to quote'
    });

    mocks.repository.findById.mockResolvedValue({
      _id: 'parent-2',
      conversationKey: 'entity:queue:queue-9',
      conversationKind: 'entity',
      organizationId: 'org-other',
      senderUserId: 'user-b',
      message: 'elsewhere',
      timestamp: new Date('2026-09-16T10:00:00.000Z')
    });
    await expect(supportService.sendUserMessage({ ...auth, process: { active: true, lineageBindings: [] } }, {
      entity: { type: 'organization', id: 'org-1' },
      message: 'cross-family reply',
      parentMessageId: 'parent-2'
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('joins entity chats at the top-level nodes of the lineage trees', async () => {
    // Live lineage: the queue carries projectId; the walk climbs to the
    // project whose type has no non-organization parent binding, even when
    // the stored entityPath is degraded.
    mocks.appRegistry.getEntityService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => {
        const table = {
          organization: { _id: 'org-1', identity: { name: 'Org1' }, lineage: {} },
          project: { _id: 'project-1', identity: { name: 'P1' }, lineage: { organizationId: 'org-1' } },
          library: { _id: 'library-1', identity: { name: 'Lib' }, lineage: { organizationId: 'org-1' } },
          queue: { _id: 'queue-1', identity: { name: 'Queue 1' }, lineage: { organizationId: 'org-1', projectId: 'project-1' } }
        };
        const dto = table[type] && table[type]._id === String(id) ? table[type] : null;
        return dto ? { toJSON: () => dto } : null;
      })
    }));
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'entity:queue:queue-1',
        conversationKind: 'entity',
        organizationId: 'org-1',
        entityLink: { type: 'queue', id: 'queue-1', name: 'Queue 1' },
        entityPath: [
          { type: 'organization', id: 'org-1', name: 'Org1' },
          { type: 'queue', id: 'queue-1', name: 'Queue 1' }
        ],
        message: 'nested',
        senderUserId: 'user-b',
        timestamp: new Date('2026-09-16T10:00:00.000Z')
      },
      {
        conversationKey: 'entity:organization:org-1',
        conversationKind: 'entity',
        organizationId: 'org-1',
        entityLink: { type: 'organization', id: 'org-1', name: 'Org1' },
        entityPath: [{ type: 'organization', id: 'org-1', name: 'Org1' }],
        message: 'org-level',
        senderUserId: 'user-b',
        timestamp: new Date('2026-09-16T11:00:00.000Z')
      }
    ]);
    mocks.repository.findReadStates.mockResolvedValue([]);

    const conversations = await supportService.listUserConversations({ ...auth, process: { active: true, lineageBindings: [
      { childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }
    ] } });

    // The queue message climbs its live lineage to the project (top-level
    // type); the org-linked message keeps the organization row; the queue
    // stays available as a Detailed leaf row.
    const entityRows = conversations.filter(item => item.conversationKind === 'entity');
    expect(entityRows).toEqual([
      expect.objectContaining({
        conversationKey: 'entity:organization:org-1',
        isEntityRoot: true,
        entityName: 'Org1',
        unreadCount: 1
      }),
      expect.objectContaining({
        conversationKey: 'entity:project:project-1',
        typeId: 'project',
        entityName: 'P1',
        unreadCount: 1
      }),
      expect.objectContaining({
        conversationKey: 'entity:queue:queue-1',
        isLeafRow: true,
        entityName: 'Queue 1',
        unreadCount: 1
      })
    ]);
  });

  it('creates group chats with the creator plus reachable participants', async () => {
    mocks.usersService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} }) },
      { toJSON: () => ({ _id: 'user-c', identity: { name: 'User C' }, data: {} }) }
    ]);
    mocks.repository.insertGroup.mockImplementation(async doc => ({ ...doc, _id: 'group-1' }));

    const group = await supportService.createGroup(auth, { name: 'Workshop', participantIds: ['user-b', 'user-outsider'] });

    expect(group).toMatchObject({
      _id: 'group-1',
      identity: { name: 'Workshop' },
      participants: ['user-a', 'user-b']
    });
    expect(mocks.repository.insertGroup).toHaveBeenCalledWith(expect.objectContaining({
      lineage: { organizationId: 'org-1' },
      participants: ['user-a', 'user-b']
    }));
    await expect(supportService.createGroup(auth, { name: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(supportService.createGroup({ ...auth, organizationId: null }, { name: 'X' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves group conversation contexts for members and admins only', async () => {
    mocks.repository.findGroupById.mockResolvedValue({
      _id: 'group-1',
      identity: { name: 'Workshop' },
      origin: { userId: 'user-a' },
      lineage: { organizationId: 'org-1' },
      participants: ['user-a', 'user-b']
    });

    await expect(supportService.getConversationContextByKey(auth, 'group:group-1')).resolves.toMatchObject({
      kind: 'group',
      conversationKey: 'group:group-1',
      participants: ['user-a', 'user-b'],
      name: 'Workshop'
    });
    const outsider = { ...auth, userId: 'user-c' };
    await expect(supportService.getConversationContextByKey(outsider, 'group:group-1')).rejects.toMatchObject({ statusCode: 403 });
    const admin = { ...outsider, isAdmin: true };
    await expect(supportService.getConversationContextByKey(admin, 'group:group-1')).resolves.toMatchObject({ kind: 'group' });
    mocks.repository.findGroupById.mockResolvedValue(null);
    await expect(supportService.getConversationContextByKey(auth, 'group:missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes groups only for the creator or admins', async () => {
    mocks.repository.findGroupById.mockResolvedValue({
      _id: 'group-1',
      identity: { name: 'Workshop' },
      origin: { userId: 'user-a' },
      lineage: { organizationId: 'org-1' },
      participants: ['user-a', 'user-b']
    });

    await expect(supportService.deleteGroup({ ...auth, userId: 'user-b' }, 'group-1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(supportService.deleteGroup(auth, 'group-1')).resolves.toEqual({ deleted: true });
    expect(mocks.repository.deleteGroupById).toHaveBeenCalledWith('group-1');
  });

  it('merges member groups into the conversation inbox, including message-less groups', async () => {
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'group:group-1',
        conversationKind: 'group',
        participants: ['user-a', 'user-b'],
        message: 'hello workshop',
        senderUserId: 'user-b',
        timestamp: new Date('2026-06-27T10:00:00.000Z')
      }
    ]);
    mocks.repository.findGroupsByParticipant.mockResolvedValue([
      {
        _id: 'group-1',
        identity: { name: 'Workshop' },
        origin: { userId: 'user-a' },
        lineage: { organizationId: 'org-1' },
        participants: ['user-a', 'user-b']
      },
      {
        _id: 'group-2',
        identity: { name: 'Night Shift' },
        origin: { userId: 'user-b' },
        lineage: { organizationId: 'org-1' },
        participants: ['user-a']
      }
    ]);
    mocks.repository.findReadStates.mockResolvedValue([]);

    const conversations = await supportService.listUserConversations(auth);

    expect(conversations.find(item => item.conversationKey === 'group:group-1')).toMatchObject({
      conversationKind: 'group',
      groupName: 'Workshop',
      lastMessage: 'hello workshop',
      unreadCount: 1,
      participant: null
    });
    expect(conversations.find(item => item.conversationKey === 'group:group-2')).toMatchObject({
      groupName: 'Night Shift',
      lastMessage: '',
      timestamp: null
    });
  });
});
