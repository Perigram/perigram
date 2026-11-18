import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectionsPublish: vi.fn(),
  repository: {
    findConversationMessages: vi.fn(),
    findReadStates: vi.fn(),
    markRead: vi.fn(),
    findConversationReads: vi.fn(async () => []),
    findConversationPrefs: vi.fn(async () => []),
    upsertConversationPref: vi.fn(),
    findOthersReadStates: vi.fn(async () => []),
    insert: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    findSince: vi.fn(),
    findTranscript: vi.fn(async () => null),
    findTranscripts: vi.fn(async () => []),
    upsertTranscript: vi.fn(),
    insertGroup: vi.fn(),
    findGroupById: vi.fn(),
    findGroupsByParticipant: vi.fn(async () => []),
    deleteGroupById: vi.fn()
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
  processRuntime: { resolveProcessAuth: vi.fn(async (auth) => auth) },
  filesService: { getFileBuffer: vi.fn() },
  transcriptionService: { transcribeAudio: vi.fn() },
  instancesService: { declarationForType: vi.fn(async () => null) }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => mocks.appRegistry
}));
vi.mock('~/server/features/connections/service.js', () => ({
  publish: mocks.connectionsPublish,
  registerTopicAuthorizer: vi.fn()
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
vi.mock('~/server/features/files/service.js', () => mocks.filesService);
vi.mock('~/server/features/transcription/service.js', () => mocks.transcriptionService);
vi.mock('~/server/features/instances/service.js', () => mocks.instancesService);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as supportService from './service.js';
import { facadePackContent } from '../../../test-tools/facade-plugin.js';

const auth = {
  userId: 'user-a',
  organizationId: 'org-1',
  memberships: [{ organizationId: 'org-1' }]
};

describe('support communication service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => input);
    mocks.appRegistry.getInstanceService.mockImplementation(() => ({ processGetById: vi.fn(async () => null) }));
    // Real declaration resolution by default (pack snapshot facets and
    // trait shapes); materialization tests override per type. Facade
    // plugin types resolve from the listing — the installed layer.
    mocks.instancesService.declarationForType.mockImplementation(async (typeId, organizationId) => {
      const facadeType = facadePackContent.types.find(type => type.id === typeId);
      if (facadeType) return facadeType;
      const actual = await vi.importActual('~/server/features/instances/service.js');
      return actual.declarationForType(typeId, organizationId);
    });
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
        instanceRefs: [{ type: 'queue', id: 'queue-1', label: 'Queue 1' }],
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
      instanceRefs: [{ type: 'queue', id: 'queue-1', label: 'Queue 1' }],
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


  it('loads concrete options for generated readable instance sources', async () => {
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async () => null),
      processList: vi.fn(async () => (type === 'sheet_design'
        ? [
            { _id: 'sheet-1', name: 'Sheet Alpha', fields: {} }
          ]
        : []))
    }));
    const processAuth = {
      ...auth,
      process: { active: true },
      effectivePermissions: {
        sheet_designs: [{ level: 'read' }]
      },
      screens: [{
        id: 'sheet_screen',
        sources: [{
          id: 'sheet_design',
          typeId: 'sheet_design',
          label: 'Sheet Designs',
          required: { feature: 'sheet_designs', level: 'read' }
        }]
      }]
    };

    const options = await supportService.listEntityOptions(processAuth, 'sheet_design', 'alpha');

    // Registry-resolved loaders (CTS §13 processList) — one seam for every
    // type, no per-feature imports in the framework.
    expect(options).toEqual([
      {
        type: 'sheet_design',
        value: 'sheet-1',
        label: 'Sheet Alpha',
        instance: { _id: 'sheet-1', name: 'Sheet Alpha', fields: {} }
      }
    ]);
  });






  it('keeps cassette preview fields in compact chat instance snapshots', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async () => (type === 'cassette'
        ? {
            _id: 'cassette-1',
            name: 'Iklya 1',
            organizationId: 'org-1',
            lineage: {},
            fields: {
              mapping: { 'cut.outer': 'cut.outer' },
              polygonParts: [{ coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }],
              layerData: []
            }
          }
        : null)),
      processList: vi.fn(async () => (type === 'cassette'
        ? [
            {
              _id: 'cassette-1',
              name: 'Iklya 1',
              organizationId: 'org-1',
              lineage: {},
              fields: {
                mapping: { 'cut.outer': 'cut.outer' },
                polygonParts: [{ coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }],
                layerData: []
              }
            }
          ]
        : []))
    }));

    const message = await supportService.sendUserMessage({
      ...auth,
      process: { active: true, lineageBindings: [] },
      screens: [{
        id: 'library_detail',
        sources: [{ id: 'cassette', typeId: 'cassette', mode: 'list' }]
      }],
      effectivePermissions: {}
    }, {
      message: 'Preview',
      instanceRefs: [{ type: 'cassette', id: 'cassette-1' }]
    });

    expect(message.instanceRefs).toEqual([
      expect.objectContaining({
        type: 'cassette',
        id: 'cassette-1',
        instance: expect.objectContaining({
          _id: 'cassette-1',
          fields: expect.objectContaining({
            mapping: { 'cut.outer': 'cut.outer' },
            polygonParts: [{ coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }]
          })
        })
      })
    ]);
  });, 15_000);  it('allows attachment-only messages when at least one ref survives validation', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async () => (type === 'cassette'
        ? { _id: 'cassette-1', name: 'Iklya 1', fields: {} }
        : null)),
      processList: vi.fn(async () => (type === 'cassette'
        ? [{ _id: 'cassette-1', name: 'Iklya 1', fields: {} }]
        : []))
    }));

    const message = await supportService.sendUserMessage({
      ...auth,
      process: { active: true, lineageBindings: [] },
      screens: [{
        id: 'library_detail',
        sources: [{ id: 'cassette', typeId: 'cassette', mode: 'list' }]
      }],
      effectivePermissions: {}
    }, {
      message: '   ',
      instanceRefs: [{ type: 'cassette', id: 'cassette-1' }]
    });

    expect(message.message).toBe('');
    expect(message.instanceRefs).toEqual([
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

  it('persists agent run provenance on the reply (server-authored only)', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'done',
      agent: { thinking: 'need the types', tools: [{ id: 't1', name: 'list_types', status: 'done' }] }
    });

    expect(message.agent).toEqual({
      thinking: 'need the types',
      tools: [{ id: 't1', name: 'list_types', status: 'done' }]
    });
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
      attachments: [{ kind: 'audio', fileId: 'gridfs-1', mimeType: 'audio/webm', durationSeconds: 12 }]
    });

    expect(message.message).toBe('');
    expect(message.attachments).toEqual([{
      kind: 'audio',
      fileId: 'gridfs-1',
      mimeType: 'audio/webm',
      durationSeconds: 12
    }]);
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:direct:user-a:user-b',
      expect.objectContaining({ type: 'message' })
    );
  });

  it('sends multi-file galleries in common chats without instance linkage', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    const message = await supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'site photos',
      attachments: [
        { kind: 'image', fileId: 'gridfs-a', mimeType: 'image/png', name: 'facade.png', size: 2048 },
        { kind: 'image', fileId: 'gridfs-b', mimeType: 'image/jpeg', name: 'closeup.jpg', size: 4096 },
        { kind: 'file', fileId: 'gridfs-c', mimeType: 'application/pdf', name: 'report.pdf', size: 8192 }
      ]
    });

    expect(message.attachments).toHaveLength(3);
    expect(message.attachments[0]).toMatchObject({ kind: 'image', fileId: 'gridfs-a', name: 'facade.png', size: 2048 });
    expect(message.attachments[2]).toMatchObject({ kind: 'file', name: 'report.pdf' });
  });

  it('rejects unsupported chat attachment kinds and over-limit attachment lists', async () => {
    mocks.usersService.getById.mockResolvedValue({
      memberships: [{ organizationId: 'org-1' }],
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });

    await expect(supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      attachments: [{ kind: 'hologram', fileId: 'gridfs-1' }]
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      attachments: Array.from({ length: 11 }, (_, index) => ({ kind: 'file', fileId: `gridfs-${index}` }))
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('voice message transcription', () => {
    const audioMessage = {
      _id: 'msg-1',
      conversationKey: 'direct:user-a:user-b',
      conversationKind: 'direct',
      participants: ['user-a', 'user-b'],
      senderUserId: 'user-b',
      message: '',
      attachments: [{ kind: 'audio', fileId: 'gridfs-1', mimeType: 'audio/webm', durationSeconds: 3 }],
      instancePath: []
    };
    const directRecipient = () => {
      mocks.usersService.getById.mockResolvedValue({
        memberships: [{ organizationId: 'org-1' }],
        toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
      });
    };

    it('stores the transcript per user and returns it without touching the shared message', async () => {
      directRecipient();
      mocks.repository.findById.mockResolvedValue(audioMessage);
      mocks.repository.findTranscript.mockResolvedValue(null);
      mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('audio-bytes'));
      mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'hello there', provider: 'local', model: 'whisper-1' });
      mocks.repository.upsertTranscript.mockImplementation(async (input) => ({ messageId: input.messageId, userId: input.userId, text: input.text }));

      const message = await supportService.transcribeMessageAudio(auth, 'msg-1');

      expect(message).toMatchObject({ _id: 'msg-1', transcript: 'hello there' });
      expect(message.message).toBe('');
      expect(message.attachments[0].transcription).toBeUndefined();
      expect(mocks.transcriptionService.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({
        filename: 'voice-message.webm',
        mimeType: 'audio/webm',
        organizationId: 'org-1'
      }));
      expect(mocks.repository.upsertTranscript).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'msg-1',
        userId: 'user-a',
        text: 'hello there',
        provider: 'local',
        model: 'whisper-1'
      }));
      // The transcript is private: the shared message document is never
      // updated and no conversation event carries it to other viewers.
      expect(mocks.repository.updateById).not.toHaveBeenCalled();
      expect(mocks.connectionsPublish).not.toHaveBeenCalled();
    });

    it('merges the viewer transcript onto message pages', async () => {
      mocks.repository.find.mockResolvedValue([audioMessage, { ...audioMessage, _id: 'msg-2' }]);
      mocks.repository.findTranscripts.mockResolvedValue([{ messageId: 'msg-1', text: 'hello there' }]);

      const page = await supportService.listMessages({ conversationKey: 'direct:user-a:user-b' }, {}, 'user-a');

      expect(page[0]).toMatchObject({ _id: 'msg-1', transcript: 'hello there' });
      expect(page[1]).toMatchObject({ _id: 'msg-2' });
      expect(page[1].transcript).toBeUndefined();
      expect(mocks.repository.findTranscripts).toHaveBeenCalledWith('user-a', ['msg-1', 'msg-2']);
    });

    it('rejects messages outside the caller\'s conversations', async () => {
      mocks.repository.findById.mockResolvedValue({
        ...audioMessage,
        conversationKey: 'direct:user-x:user-y',
        participants: ['user-x', 'user-y']
      });

      await expect(supportService.transcribeMessageAudio(auth, 'msg-1'))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.transcriptionService.transcribeAudio).not.toHaveBeenCalled();
    });

    it('rejects missing, non-audio, already transcribed, and text-carrying messages', async () => {
      mocks.repository.findById.mockResolvedValue(null);
      await expect(supportService.transcribeMessageAudio(auth, 'missing'))
        .rejects.toMatchObject({ statusCode: 404 });

      mocks.repository.findById.mockResolvedValue({ ...audioMessage, attachments: [] });
      await expect(supportService.transcribeMessageAudio(auth, 'msg-1'))
        .rejects.toMatchObject({ statusCode: 400 });

      directRecipient();
      mocks.repository.findById.mockResolvedValue(audioMessage);
      mocks.repository.findTranscript.mockResolvedValue({ messageId: 'msg-1', userId: 'user-a', text: 'hello there' });
      await expect(supportService.transcribeMessageAudio(auth, 'msg-1'))
        .rejects.toMatchObject({ statusCode: 409 });

      mocks.repository.findTranscript.mockResolvedValue(null);
      mocks.repository.findById.mockResolvedValue({ ...audioMessage, message: 'caption' });
      await expect(supportService.transcribeMessageAudio(auth, 'msg-1'))
        .rejects.toMatchObject({ statusCode: 409, message: 'Message already carries text' });
      expect(mocks.repository.upsertTranscript).not.toHaveBeenCalled();
    });

    it('surfaces recordings without speech as 422 and writes nothing', async () => {
      directRecipient();
      mocks.repository.findTranscript.mockResolvedValue(null);
      mocks.repository.findById.mockResolvedValue(audioMessage);
      mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('audio-bytes'));
      mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: '', provider: 'local', model: 'whisper-1' });

      await expect(supportService.transcribeMessageAudio(auth, 'msg-1'))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(mocks.repository.upsertTranscript).not.toHaveBeenCalled();
    });
  });

  describe('message forwarding', () => {
    const sourceMessage = {
      _id: 'msg-9',
      conversationKey: 'direct:user-a:user-b',
      conversationKind: 'direct',
      participants: ['user-a', 'user-b'],
      senderUserId: 'user-b',
      message: 'look at this',
      attachments: [{ kind: 'image', fileId: 'gridfs-7', mimeType: 'image/png', name: 'facade.png' }],
      timestamp: new Date('2026-10-01T10:00:00Z')
    };

    it('sends a fresh message from the forwarder carrying text, attachments, and provenance', async () => {
      mocks.usersService.getById.mockImplementation(async (id) => ({
        memberships: [{ organizationId: 'org-1' }],
        toJSON: () => ({ _id: id, identity: { name: id === 'user-b' ? 'User B' : 'User A' }, data: {} })
      }));
      mocks.repository.findById.mockImplementation(async (id) => (id === 'msg-9' ? sourceMessage : null));
      mocks.repository.insert.mockImplementation(async (record) => record);

      const forwarded = await supportService.forwardMessage(auth, 'msg-9', { conversationKey: 'direct:user-a:user-c' });

      expect(forwarded).toMatchObject({
        conversationKey: 'direct:user-a:user-c',
        senderUserId: 'user-a',
        message: 'look at this',
        attachments: [{ kind: 'image', fileId: 'gridfs-7' }],
        forwardedFrom: { senderUserId: 'user-b', senderName: 'User B' }
      });
      expect(forwarded.parent).toBeUndefined();
      expect(mocks.repository.insert).toHaveBeenCalledWith(expect.objectContaining({
        conversationKey: 'direct:user-a:user-c'
      }), expect.any(Object));
    });

    it('rejects sources outside the caller\'s conversations and unknown targets', async () => {
      mocks.repository.findById.mockResolvedValue({
        ...sourceMessage,
        conversationKey: 'direct:user-x:user-y',
        participants: ['user-x', 'user-y']
      });
      await expect(supportService.forwardMessage(auth, 'msg-9', { conversationKey: 'direct:user-a:user-c' }))
        .rejects.toMatchObject({ statusCode: 403 });

      mocks.repository.findById.mockResolvedValue(sourceMessage);
      await expect(supportService.forwardMessage(auth, 'msg-9', { conversationKey: 'direct:user-x:user-y' }))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.repository.insert).not.toHaveBeenCalled();
    });
  });

  describe('instance chat file materialization', () => {
    const parentInstance = () => ({ _id: 'order-1', identity: { name: 'Site order' }, lineage: { organizationId: 'org-1' } });
    const registryWithParent = (uploadHandler) => {
      mocks.appRegistry.getInstanceService.mockImplementation((type) => {
        if (type === 'site-order') {
          return { processGetById: vi.fn(async () => parentInstance()) };
        }
        return {
          processGetById: vi.fn(async () => null),
          ...(uploadHandler ? { constructionHandlers: { upload: uploadHandler } } : {})
        };
      });
    };

    it('materializes an uploaded file as the accepting child instance and refs it', async () => {
      mocks.repository.insert.mockImplementation(async (record) => record);
      const upload = vi.fn(async (draft) => ({
        _id: 'file-instance-1',
        type: 'site-photo',
        name: draft.name,
        lineage: { siteOrderId: 'order-1' }
      }));
      registryWithParent(upload);
      mocks.instancesService.declarationForType.mockImplementation(async (typeId) => {
        if (typeId === 'site-order') {
          return { id: 'site-order', class: 'group', edges: { children: { photos: { types: ['site-photo'], onRemove: 'restrict' } } } };
        }
        if (typeId === 'site-photo') {
          return { id: 'site-photo', class: 'file', payload: { mime: ['image/png', 'image/jpeg'], creation: ['upload'] } };
        }
        return null;
      });

      const message = await supportService.sendUserMessage(auth, {
        instance: { type: 'site-order', id: 'order-1' },
        message: '',
        attachments: [{
          kind: 'image',
          fileId: 'gridfs-photo',
          mimeType: 'image/png',
          name: 'facade.png',
          size: 1024,
          targetTypeId: 'site-photo'
        }]
      });

      // The stored descriptor drops the request-vocabulary targetTypeId;
      // the created instance joins the refs with its snapshot.
      expect(message.attachments).toEqual([{
        kind: 'image',
        fileId: 'gridfs-photo',
        mimeType: 'image/png',
        name: 'facade.png',
        size: 1024
      }]);
      expect(upload).toHaveBeenCalledWith({
        payload: { fileId: 'gridfs-photo', mime: 'image/png', size: 1024, name: 'facade.png' },
        lineage: { siteOrderId: 'order-1' },
        name: 'facade.png'
      }, { userId: 'user-a', organizationId: 'org-1' });
      expect(message.instanceRefs).toEqual([expect.objectContaining({
        type: 'site-photo',
        id: 'file-instance-1',
        label: 'facade.png',
        instance: expect.objectContaining({ _id: 'file-instance-1' })
      })]);
    });

    it('rejects an instance-chat file no declared child accepts', async () => {
      registryWithParent();
      mocks.instancesService.declarationForType.mockImplementation(async (typeId) => (
        typeId === 'site-order' ? { id: 'site-order', class: 'group', edges: {} } : null
      ));

      await expect(supportService.sendUserMessage(auth, {
        instance: { type: 'site-order', id: 'order-1' },
        attachments: [{ kind: 'file', fileId: 'gridfs-x', mimeType: 'application/pdf' }]
      })).rejects.toMatchObject({ statusCode: 400, message: 'This chat accepts no file uploads' });
    });

    it('rejects an ambiguous file without a chosen target type', async () => {
      const upload = vi.fn(async (draft) => ({ _id: 'file-any', name: draft.name }));
      registryWithParent(upload);
      mocks.instancesService.declarationForType.mockImplementation(async (typeId) => {
        if (typeId === 'site-order') {
          return { id: 'site-order', class: 'group', edges: { children: { shots: { types: ['site-photo', 'site-report'] } } } };
        }
        return { id: typeId, class: 'file', payload: { mime: ['image/png'], creation: ['upload'] } };
      });

      await expect(supportService.sendUserMessage(auth, {
        instance: { type: 'site-order', id: 'order-1' },
        attachments: [{ kind: 'image', fileId: 'gridfs-x', mimeType: 'image/png' }]
      })).rejects.toMatchObject({ statusCode: 400, message: 'Attachment matches several target types; pick one' });
      expect(upload).not.toHaveBeenCalled();
    });

    it('keeps files unlinked in party-target chats (the organization chat)', async () => {
      mocks.repository.insert.mockImplementation(async (record) => record);
      mocks.appRegistry.getInstanceService.mockImplementation((type) => (
        type === 'organization'
          ? { processGetById: vi.fn(async () => ({ _id: 'org-1', identity: { name: 'Org' }, lineage: {} })) }
          : { processGetById: vi.fn(async () => null) }
      ));
      mocks.instancesService.declarationForType.mockImplementation(async (typeId) => (
        typeId === 'organization' ? { id: 'organization', class: 'party' } : null
      ));

      const message = await supportService.sendUserMessage(auth, {
        instance: { type: 'organization', id: 'org-1' },
        message: '',
        attachments: [{ kind: 'file', fileId: 'gridfs-x', mimeType: 'application/pdf', name: 'notes.pdf' }]
      });

      expect(message.attachments).toHaveLength(1);
      expect(message.instanceRefs).toEqual([]);
    });
  });

  it('allows refs of a creator-only file type when the process exposes its create action', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    const photo = {
      toJSON: () => ({ _id: 'photo-1', name: 'Scan', organizationId: 'org-1', fields: {} })
    };
    mocks.appRegistry.getInstanceService.mockImplementation(() => ({
      processGetById: vi.fn(async () => null),
      processList: vi.fn(async () => [photo])
    }));
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {},
      screens: [],
      roleAssignments: {
        actions: [{
          actionKind: 'createInstance',
          construction: {
            inputs: [{
              creator: {
                typeId: 'site-photo',
                attachmentKinds: [{ kind: 'site-photo', creation: { mode: 'capture' } }]
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
      instanceRefs: [{ type: 'site-photo', id: 'photo-1' }]
    });

    expect(message.instanceRefs).toEqual([
      expect.objectContaining({
        type: 'site-photo',
        id: 'photo-1',
        label: 'Scan'
      })
    ]);
  });

  it('keeps creator-only types unattachable in a process without their create action', async () => {
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
      message: 'no file types here',
      instanceRefs: [{ type: 'site-photo', id: 'photo-1' }]
    });

    expect(message.instanceRefs).toEqual([]);
  });

  it('tolerates non-array attachment-kind shapes on creator actions instead of failing', async () => {
    mocks.processRuntime.resolveProcessAuth.mockImplementation(async (input) => ({
      ...input,
      process: { active: true },
      effectivePermissions: {},
      screens: [],
      roleAssignments: {
        actions: [{
          actionKind: 'createInstance',
          typeId: 'site-photo',
          construction: {
            inputs: [{ id: 'photo', creator: { typeId: 'site-photo', attachmentKinds: 'userCreatable' } }]
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
    // takes down type-ids, instance-options, and every message send.
    await expect(supportService.listEntityOptionTypes(auth)).resolves.toEqual([]);
    await expect(supportService.sendUserMessage(auth, {
      recipientUserId: 'user-b',
      message: 'unexpanded kinds must not break sends'
    })).resolves.toBeTruthy();
  });
  it('resolves instance conversation contexts through the scoped registry read', async () => {
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => (type === 'project' && id === 'project-1'
        ? { toJSON: () => ({ _id: 'project-1', name: 'Facade Alpha', organizationId: 'org-1', lineage: {} }) }
        : null))
    }));

    const context = await supportService.getInstanceConversationContext(auth, 'instance:project:project-1');

    expect(context).toMatchObject({
      kind: 'instance',
      conversationKey: 'instance:project:project-1',
      typeId: 'project',
      instanceName: 'Facade Alpha',
      organizationId: 'org-1'
    });
    await expect(supportService.getInstanceConversationContext(auth, 'instance:project:missing'))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(supportService.getInstanceConversationContext(auth, 'instance:project'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves child-instance contexts through the scoped option window', async () => {
    // Direct registry reads deny cassettes; the scoped list window the
    // picker browses still returns them, and the chat context follows it.
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async () => (type === 'cassette'
        ? null
        : { toJSON: () => ({ _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }) })),
      processList: vi.fn(async () => (type === 'cassette'
        ? [
            { _id: 'cassette-1', name: 'Iklya', organizationId: 'org-1', lineage: { libraryId: 'library-1' }, fields: {} }
          ]
        : []))
    }));

    const context = await supportService.getInstanceConversationContext({
      ...auth,
      process: { active: true, lineageBindings: [] },
      screens: [{
        id: 'library_detail',
        sources: [{ id: 'cassette', typeId: 'cassette', mode: 'list' }]
      }],
      effectivePermissions: {}
    }, 'instance:cassette:cassette-1');

    expect(context).toMatchObject({
      kind: 'instance',
      conversationKey: 'instance:cassette:cassette-1',
      instanceName: 'Iklya'
    });
  });

  it('composes aggregated instance views through the instance path', () => {
    const context = {
      typeId: 'organization',
      instanceId: 'org-1',
      match: { conversationKey: 'instance:organization:org-1' }
    };
    expect(supportService.instanceConversationMatch(context, true)).toEqual({
      instancePath: { $elemMatch: { type: 'organization', id: 'org-1' } }
    });
    expect(supportService.instanceConversationMatch(context, false)).toEqual({
      conversationKey: 'instance:organization:org-1'
    });
  });

  it('links messages to instances with an ancestry path rooted at the organization', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    const table = {
      'queue:queue-1': { _id: 'queue-1', name: 'Queue 1', organizationId: 'org-1', lineage: { projectId: 'project-1' } },
      'project:project-1': { _id: 'project-1', name: 'Facade Alpha', organizationId: 'org-1', lineage: {} },
      'organization:org-1': { _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }
    };
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => {
        const dto = table[`${type}:${id}`];
        return dto ? { toJSON: () => dto } : null;
      })
    }));
    const instanceAuth = {
      ...auth,
      process: { active: true, lineageBindings: [
        { childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }
      ] }
    };

    const message = await supportService.sendUserMessage(instanceAuth, {
      instance: { type: 'queue', id: 'queue-1' },
      message: 'nested update'
    });

    expect(message.conversationKey).toBe('instance:queue:queue-1');
    expect(message.conversationKind).toBe('instance');
    expect(message.instanceLink).toEqual({ type: 'queue', id: 'queue-1', name: 'Queue 1' });
    expect(message.instancePath).toEqual([
      { type: 'organization', id: 'org-1', name: 'Org1' },
      { type: 'project', id: 'project-1', name: 'Facade Alpha' },
      { type: 'queue', id: 'queue-1', name: 'Queue 1' }
    ]);
    expect(message.organizationId).toBe('org-1');
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:instance:organization:org-1',
      expect.objectContaining({ type: 'message' })
    );
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'conversation:instance:queue:queue-1',
      expect.objectContaining({ type: 'message' })
    );
    expect(mocks.connectionsPublish).toHaveBeenCalledWith(
      'org:org-1',
      expect.objectContaining({ type: 'support.inbox' })
    );
  });

  it('denormalizes quoted parents and accepts replies across the composed instance family', async () => {
    mocks.repository.insert.mockImplementation(async (record) => record);
    mocks.repository.findById.mockResolvedValue({
      _id: 'parent-1',
      conversationKey: 'instance:queue:queue-1',
      conversationKind: 'instance',
      organizationId: 'org-1',
      senderUserId: 'user-b',
      message: 'Original point that is long enough to quote',
      attachment: null,
      timestamp: new Date('2026-09-16T10:00:00.000Z')
    });
    mocks.usersService.getById.mockResolvedValue({
      toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
    });
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => (type === 'organization' && id === 'org-1'
        ? { toJSON: () => ({ _id: 'org-1', identity: { name: 'Org1' }, lineage: {} }) }
        : null))
    }));

    const message = await supportService.sendUserMessage({ ...auth, process: { active: true, lineageBindings: [] } }, {
      instance: { type: 'organization', id: 'org-1' },
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
      conversationKey: 'instance:queue:queue-9',
      conversationKind: 'instance',
      organizationId: 'org-other',
      senderUserId: 'user-b',
      message: 'elsewhere',
      timestamp: new Date('2026-09-16T10:00:00.000Z')
    });
    await expect(supportService.sendUserMessage({ ...auth, process: { active: true, lineageBindings: [] } }, {
      instance: { type: 'organization', id: 'org-1' },
      message: 'cross-family reply',
      parentMessageId: 'parent-2'
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('nests instance chats under the org chat root by live lineage', async () => {
    // Live lineage: the queue carries projectId; the ancestor walk follows
    // it even when the stored instancePath is degraded, and rows nest under
    // their nearest row-bearing ancestor — the org chat roots the tree
    // (unmessed instances without their own row never create one).
    mocks.appRegistry.getInstanceService.mockImplementation((type) => ({
      processGetById: vi.fn(async (id) => {
        const table = {
          organization: { _id: 'org-1', identity: { name: 'Org1' }, lineage: {} },
          project: { _id: 'project-1', identity: { name: 'P1' }, lineage: { organizationId: 'org-1' } },
          library: { _id: 'library-1', identity: { name: 'Lib' }, lineage: { organizationId: 'org-1' } },
          queue: { _id: 'queue-1', name: 'Queue 1', organizationId: 'org-1', lineage: { projectId: 'project-1' } }
        };
        const dto = table[type] && table[type]._id === String(id) ? table[type] : null;
        return dto ? { toJSON: () => dto } : null;
      })
    }));
    mocks.repository.findConversationMessages.mockResolvedValue([
      {
        conversationKey: 'instance:queue:queue-1',
        conversationKind: 'instance',
        organizationId: 'org-1',
        instanceLink: { type: 'queue', id: 'queue-1', name: 'Queue 1' },
        instancePath: [
          { type: 'organization', id: 'org-1', name: 'Org1' },
          { type: 'queue', id: 'queue-1', name: 'Queue 1' }
        ],
        message: 'nested',
        senderUserId: 'user-b',
        timestamp: new Date('2026-09-16T10:00:00.000Z')
      },
      {
        conversationKey: 'instance:organization:org-1',
        conversationKind: 'instance',
        organizationId: 'org-1',
        instanceLink: { type: 'organization', id: 'org-1', name: 'Org1' },
        instancePath: [{ type: 'organization', id: 'org-1', name: 'Org1' }],
        message: 'org-level',
        senderUserId: 'user-b',
        timestamp: new Date('2026-09-16T11:00:00.000Z')
      }
    ]);
    mocks.repository.findReadStates.mockResolvedValue([]);

    const conversations = await supportService.listUserConversations({ ...auth, process: { active: true, lineageBindings: [
      { childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }
    ] } });

    // One row per messaged instance: the org chat roots the tree (its
    // unread aggregates the nested queue message — the composed view), and
    // the queue row nests under it; the project has no messages and no row.
    const instanceRows = conversations.filter(item => item.conversationKind === 'instance');
    expect(instanceRows).toEqual([
      expect.objectContaining({
        conversationKey: 'instance:organization:org-1',
        isInstanceRoot: true,
        instanceName: 'Org1',
        unreadCount: 2
      }),
      expect.objectContaining({
        conversationKey: 'instance:queue:queue-1',
        instanceName: 'Queue 1',
        parentKey: 'instance:organization:org-1',
        unreadCount: 1
      })
    ]);
  });

  it('creates group chats with the creator plus any existing participants', async () => {
    mocks.usersService.getById.mockImplementation(async id => (
      ['user-b', 'user-outsider'].includes(String(id))
        ? { toJSON: () => ({ _id: String(id), identity: { name: `User ${id}` }, data: {} }) }
        : null
    ));
    mocks.repository.insertGroup.mockImplementation(async doc => ({ ...doc, _id: 'group-1' }));

    const group = await supportService.createGroup(auth, { name: 'Workshop', participantIds: ['user-b', 'user-outsider'] });

    expect(group).toMatchObject({
      _id: 'group-1',
      identity: { name: 'Workshop' },
      participants: ['user-a', 'user-b', 'user-outsider']
    });
    expect(mocks.repository.insertGroup).toHaveBeenCalledWith(expect.objectContaining({
      lineage: { organizationId: 'org-1' },
      participants: ['user-a', 'user-b', 'user-outsider']
    }));
    await expect(supportService.createGroup(auth, { name: 'Workshop', participantIds: ['user-ghost'] }))
      .rejects.toMatchObject({ statusCode: 400 });
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

  it('refuses bot targets on the human membership seams (assistant membership is twin-only)', async () => {
    mocks.repository.findGroupById.mockResolvedValue({
      _id: 'group-1',
      identity: { name: 'Workshop' },
      origin: { userId: 'user-a' },
      lineage: { organizationId: 'org-1' },
      participants: ['user-a', 'user-b', 'user-bot']
    });
    mocks.usersService.getById.mockImplementation(async id => (
      String(id) === 'user-bot'
        ? { toJSON: () => ({ _id: 'user-bot', identity: { name: 'Assistant' }, data: { bot: { createdAt: new Date() } } }), data: { bot: { createdAt: new Date() } } }
        : { toJSON: () => ({ _id: String(id), identity: { name: `User ${id}` }, data: {} }), data: {} }
    ));

    // The participants entry and the AI's subscription cannot diverge: the
    // creator-or-admin seam never seats or removes the assistant.
    await expect(supportService.addGroupParticipant(auth, 'group-1', 'user-bot')).rejects.toMatchObject({ statusCode: 400 });
    await expect(supportService.removeGroupParticipant(auth, 'group-1', 'user-bot')).rejects.toMatchObject({ statusCode: 400 });
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

  describe('CTS per-class instance chats', () => {
    // §3 wire DTO shape the generic instance service projects (instances
    // README: identity/lineage projection of the stored shape).
    const ctsDto = (typeId, id, name, lineage = {}) => ({
      _id: id,
      type: typeId,
      typeVersion: 1,
      organizationId: 'org-1',
      name,
      state: null,
      lineage: { ...lineage },
      relations: {},
      fields: {}
    });

    const registryWith = (servicesByType) => {
      mocks.appRegistry.getInstanceService.mockImplementation((type) => (
        servicesByType[type] || { processGetById: vi.fn(async () => null) }
      ));
    };

    const ctsProcessAuth = (sources, lineageBindings = []) => ({
      ...auth,
      process: { active: true, lineageBindings },
      screens: [{ id: 'wo_screen', screenKey: 'wo_screen', sources }]
    });

    afterEach(() => {
      mocks.appRegistry.getInstanceService.mockImplementation(() => ({
        processGetById: vi.fn(async () => null)
      }));
    });

    it('loads picker options for org-authored types through the registry per-class service', async () => {
      const wo1 = ctsDto('work_order', 'wo-1', 'WO One');
      registryWith({
        work_order: {
          processList: vi.fn(async () => [wo1, ctsDto('work_order', 'wo-2', 'WO Two')]),
          processGetById: vi.fn(async () => null)
        }
      });
      const processAuth = ctsProcessAuth([
        { id: 'work_orders', typeId: 'work_order', mode: 'list', label: 'Work Orders' }
      ]);

      const options = await supportService.listEntityOptions(processAuth, 'work_order', 'one');

      expect(options).toEqual([
        { type: 'work_order', value: 'wo-1', label: 'WO One', instance: wo1 }
      ]);
    });

    it('resolves the instance context through the scoped source pool when the direct registry read misses', async () => {
      const wo1 = ctsDto('work_order', 'wo-1', 'WO One');
      registryWith({
        work_order: {
          processList: vi.fn(async () => [wo1]),
          processGetById: vi.fn(async () => null)
        }
      });
      const processAuth = ctsProcessAuth([
        { id: 'work_orders', typeId: 'work_order', mode: 'list' }
      ]);

      await expect(supportService.getInstanceConversationContext(processAuth, 'instance:work_order:wo-1'))
        .resolves.toMatchObject({
          kind: 'instance',
          typeId: 'work_order',
          instanceId: 'wo-1',
          instanceName: 'WO One',
          conversationKey: 'instance:work_order:wo-1'
        });
    });

    it('persists the ancestor path and composes the parent view from descendant messages', async () => {
      const parent = ctsDto('work_order', 'wo-1', 'WO One');
      const child = ctsDto('panel', 'panel-9', 'Panel Nine', { workOrderId: 'wo-1' });
      const org = ctsDto('organization', 'org-1', 'Acme');
      registryWith({
        work_order: { processGetById: vi.fn(async (id) => (id === 'wo-1' ? parent : null)) },
        panel: { processGetById: vi.fn(async (id) => (id === 'panel-9' ? child : null)) },
        organization: { processGetById: vi.fn(async () => org) }
      });
      const processAuth = ctsProcessAuth(
        [{ id: 'work_orders', typeId: 'work_order', mode: 'list' }],
        [{ childTypeId: 'panel', parentTypeId: 'work_order', lineageKey: 'workOrderId' }]
      );
      mocks.repository.insert.mockImplementation(async (record) => record);

      await supportService.sendUserMessage(processAuth, {
        instance: { type: 'panel', id: 'panel-9' },
        message: 'child update'
      });

      const record = mocks.repository.insert.mock.calls[0][0];
      expect(record.instanceLink).toMatchObject({ type: 'panel', id: 'panel-9', name: 'Panel Nine' });
      expect(record.instancePath.map(entry => `${entry.type}:${entry.id}`))
        .toEqual(['organization:org-1', 'work_order:wo-1', 'panel:panel-9']);

      const parentContext = await supportService.getInstanceConversationContext(processAuth, 'instance:work_order:wo-1');
      expect(supportService.instanceConversationMatch(parentContext, true)).toEqual({
        instancePath: { $elemMatch: { type: 'work_order', id: 'wo-1' } }
      });
      expect(supportService.instanceConversationMatch(parentContext, false)).toEqual({
        conversationKey: 'instance:work_order:wo-1'
      });
    });

    it('marks recipient access for org-authored types from the registry service', async () => {
      const wo1 = ctsDto('work_order', 'wo-1', 'WO One');
      registryWith({
        work_order: {
          processList: vi.fn(async () => [wo1]),
          processGetById: vi.fn(async () => null)
        }
      });
      mocks.usersService.getById.mockResolvedValue({
        memberships: [{ organizationId: 'org-1' }],
        toJSON: () => ({ _id: 'user-b', identity: { name: 'User B' }, data: {} })
      });
      const processAuth = ctsProcessAuth([
        { id: 'work_orders', typeId: 'work_order', mode: 'list' }
      ]);

      const options = await supportService.listEntityOptions(processAuth, 'work_order', '', 'user-b');

      expect(options.find(option => option.value === 'wo-1')?.recipientHasAccess).toBe(true);
    });
  });
});

describe('support search and read cursors', () => {
    it('searches a conversation with escaped text, sender, and attachment filters, newest first', async () => {
        mocks.usersService.getById.mockImplementation(async (id) => ({
            toJSON: () => ({ _id: id, identity: { name: id }, memberships: [{ organizationId: 'org-1' }] })
        }));
        mocks.repository.find.mockResolvedValue([
            { _id: 'm1', message: 'older nest', timestamp: '2026-01-01T00:00:00Z' },
            { _id: 'm2', message: 'newer nest', timestamp: '2026-01-02T00:00:00Z' }
        ]);
        const data = await supportService.searchConversationMessages(auth, {
            conversationKey: 'direct:user-a:user-b',
            q: 'nest(.*)',
            sender: 'user-a',
            attachmentKind: 'image',
            instanceType: 'e2e-probe-photo'
        });
        expect(data.map(row => row._id)).toEqual(['m2', 'm1']);
        const [match, , options] = mocks.repository.find.mock.calls[0];
        expect(match.senderUserId).toBe('user-a');
        expect(match['attachments.kind']).toBe('image');
        expect(match['instanceRefs.type']).toBe('e2e-probe-photo');
        expect(match.message.$options).toBe('i');
        expect(match.message.$regex).toBe('nest\\(\\.\\*\\)');
        expect(options.limit).toBe(50);
    });

    it('maps conversation read rows to ISO cursors', async () => {
        mocks.usersService.getById.mockImplementation(async (id) => ({
            toJSON: () => ({ _id: id, identity: { name: id }, memberships: [{ organizationId: 'org-1' }] })
        }));
        mocks.repository.findConversationReads.mockResolvedValue([
            { conversationKey: 'direct:user-a:user-b', userId: 'user-b', lastReadAt: new Date('2026-01-02T03:04:05Z') }
        ]);
        const context = await supportService.getUserConversationContext(auth, 'user-b');
        const cursors = await supportService.listReadCursors(context);
        expect(cursors).toEqual([{ userId: 'user-b', lastReadAt: '2026-01-02T03:04:05.000Z' }]);
    });
});
