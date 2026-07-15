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
  cassetteDesignsService: { list: vi.fn() },
  cassettesService: { list: vi.fn() },
  catalogsService: { list: vi.fn() },
  librariesService: { list: vi.fn() },
  projectsService: { list: vi.fn() },
  queuesService: { list: vi.fn() },
  materialPilesService: { list: vi.fn() },
  remnantsService: { list: vi.fn() },
  requisitionsService: { list: vi.fn() },
  sheetDesignsService: { list: vi.fn() },
  sheetsService: { list: vi.fn() },
  materialsService: { list: vi.fn() },
  warehousesService: { list: vi.fn() },
  processRuntime: { resolveProcessAuth: vi.fn(async (auth) => auth) }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/features/cassette-designs/service.js', () => mocks.cassetteDesignsService);
vi.mock('~/server/features/cassettes/service.js', () => mocks.cassettesService);
vi.mock('~/server/features/catalogs/service.js', () => mocks.catalogsService);
vi.mock('~/server/features/libraries/service.js', () => mocks.librariesService);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/projects/service.js', () => mocks.projectsService);
vi.mock('~/server/features/queues/service.js', () => mocks.queuesService);
vi.mock('~/server/features/material-piles/service.js', () => mocks.materialPilesService);
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
    mocks.usersService.list.mockResolvedValue([
      { toJSON: () => ({ _id: 'user-a', identity: { name: 'User A' }, data: {} }) },
      { toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} }) },
      { toJSON: () => ({ _id: 'user-c', identity: { name: 'User C' }, data: {} }) }
    ]);

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
          entityType: 'queue',
          label: 'My Queues',
          mode: 'list',
          required: { feature: 'queues', level: 'read' }
        }, {
          id: 'project',
          entityType: 'project',
          label: 'Blocked Projects',
          mode: 'list',
          required: { feature: 'projects', level: 'read' }
        }, {
          id: 'external_record',
          entityType: 'external_record',
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
        sheet_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'sheet_design_list',
        screenKey: 'sheet_design_list',
        sources: [{
          id: 'sheet_design',
          entityType: 'sheet_design',
          mode: 'list',
          label: 'Process Runs',
          required: {
            feature: 'sheet_designs',
            level: 'read',
            rule: { fact: 'primaryStatus', equals: 'CUT' }
          }
        }]
      }]
    }));
    mocks.sheetDesignsService.list.mockResolvedValue([
      { _id: 'run-1', identity: { name: 'Run From Process Auth' }, data: {} }
    ]);

    await expect(supportService.listEntityOptionTypes(auth)).resolves.toEqual([
      { value: 'sheet_design', label: 'Process Runs', labelKey: null, sourceId: 'sheet_design', screenKey: 'sheet_design_list' }
    ]);

    await expect(supportService.listEntityOptions(auth, 'sheet_design', 'process')).resolves.toEqual([
      {
        type: 'sheet_design',
        value: 'run-1',
        label: 'Run From Process Auth',
        entity: { _id: 'run-1', identity: { name: 'Run From Process Auth' }, data: {} }
      }
    ]);
    expect(mocks.sheetDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, expect.objectContaining({
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
          entityType: 'cassette_design',
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
    mocks.sheetDesignsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
      if (filters?.queueId === 'queue-1') return [{ _id: 'run-1', identity: { name: 'Run Alpha' }, data: {} }];
      if (filters?.queueId === 'queue-2') return [{ _id: 'run-2', identity: { name: 'Run Beta' }, data: {} }];
      return [];
    });
    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        queues: [{ level: 'read' }],
        sheet_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'queue_list',
        entityType: 'queue',
        sources: [{
          id: 'queue',
          entityType: 'queue',
          required: { feature: 'queues', level: 'read' },
          filters: { primaryStatus: 'READY' }
        }]
      }, {
        id: 'queue_detail',
        entityType: 'queue',
        sources: [{
          id: 'sheet_design_children',
          entityType: 'sheet_design',
          required: { feature: 'sheet_designs', level: 'read' },
          filters: { queueId: '$screen.scope.entityId' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'sheet_design', 'run');

    expect(mocks.queuesService.list).toHaveBeenCalledWith({ primaryStatus: 'READY' }, 'user-a', 'org-1', undefined, processAuth);
    expect(mocks.sheetDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-1' });
    expect(mocks.sheetDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-2' });
    expect(options).toEqual([
      {
        type: 'sheet_design',
        value: 'run-1',
        label: 'Run Alpha',
        entity: { _id: 'run-1', identity: { name: 'Run Alpha' }, data: {} }
      },
      {
        type: 'sheet_design',
        value: 'run-2',
        label: 'Run Beta',
        entity: { _id: 'run-2', identity: { name: 'Run Beta' }, data: {} }
      }
    ]);
  });

  it('uses the first generated source exposed for an attachment entity type', async () => {
    mocks.sheetDesignsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
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
        sheet_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'queue_list',
        entityType: 'queue',
        sources: [{
          id: 'queue',
          entityType: 'queue',
          required: { feature: 'queues', level: 'read' }
        }]
      }, {
        id: 'queue_detail',
        entityType: 'queue',
        sources: [{
          id: 'sheet_design_children',
          entityType: 'sheet_design',
          required: { feature: 'sheet_designs', level: 'read' },
          filters: { queueId: '$screen.scope.entityId' }
        }]
      }, {
        id: 'sheet_design_list',
        entityType: 'sheet_design',
        sources: [{
          id: 'sheet_design',
          entityType: 'sheet_design',
          required: {
            feature: 'sheet_designs',
            level: 'read',
            rule: { fact: 'primaryStatus', equals: 'CUT' }
          }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'sheet_design', 'run');

    expect(options).toEqual([
      {
        type: 'sheet_design',
        value: 'run-1',
        label: 'Run From Queue',
        entity: { _id: 'run-1', identity: { name: 'Run From Queue' }, data: {} }
      }
    ]);
    expect(mocks.sheetDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { queueId: 'queue-1' });
    expect(mocks.sheetDesignsService.list).not.toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, { primaryStatus: 'CUT' });
  });

  it('ignores generated single-entity sources when loading attachment options', async () => {
    mocks.sheetDesignsService.list.mockImplementation(async (userId, userOrg, userRole, userPermissions, filters) => {
      if (filters?.primaryStatuses === 'CUT,SHIPPED') return [{ _id: 'run-1', identity: { name: 'Run From List' }, data: {} }];
      if (Object.keys(filters || {}).length === 0) return [{ _id: 'run-2', identity: { name: 'Run From Detail' }, data: {} }];
      return [];
    });

    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        sheet_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'sheet_design_list',
        entityType: 'sheet_design',
        sources: [{
          id: 'sheet_design',
          entityType: 'sheet_design',
          mode: 'list',
          required: {
            feature: 'sheet_designs',
            level: 'read',
            rule: { any: [{ fact: 'primaryStatus', equals: 'CUT' }, { fact: 'primaryStatus', equals: 'SHIPPED' }] }
          }
        }]
      }, {
        id: 'sheet_design_detail',
        entityType: 'sheet_design',
        sources: [{
          id: 'sheet_design',
          entityType: 'sheet_design',
          mode: 'single',
          required: { feature: 'sheet_designs', level: 'read' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'sheet_design', 'run');

    expect(mocks.sheetDesignsService.list).toHaveBeenCalledTimes(1);
    expect(mocks.sheetDesignsService.list).toHaveBeenCalledWith('user-a', 'org-1', undefined, processAuth, {
      primaryStatuses: 'CUT,SHIPPED'
    });
    expect(options).toEqual([
      {
        type: 'sheet_design',
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
        lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
        lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
          lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
});
