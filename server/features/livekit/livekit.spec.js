import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectionsPublish: vi.fn(),
  repository: {
    insert: vi.fn(),
    findByEgressId: vi.fn(),
    findActiveByRoom: vi.fn(async () => []),
    findAllActive: vi.fn(async () => []),
    updateById: vi.fn(async (id, update) => ({ _id: id, ...update.$set }))
  },
  filesService: { uploadFile: vi.fn() },
  supportService: {
    getConversationContextByKey: vi.fn(),
    findChatGroup: vi.fn(),
    insertRecordingMessage: vi.fn()
  }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('~/server/features/files/service.js', () => mocks.filesService);
vi.mock('~/server/features/support/service.js', () => mocks.supportService);
vi.mock('~/server/features/connections/service.js', () => ({
  publish: mocks.connectionsPublish,
  registerTopicAuthorizer: vi.fn()
}));
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as livekitService from './service.js';

const auth = { userId: 'user-a', organizationId: 'org-1' };
const DIRECT_ROOM = 'call:direct:user-a:user-b';
const GROUP_ROOM = 'call:group:group-1';
const ORG_ROOM = 'call:org:org-9';
const GROUP = { _id: 'group-1', participants: ['user-a', 'user-b'] };

const twirpResponse = async (body, status = 200) => new Response(JSON.stringify(body), { status });

describe('livekit recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_INTERNAL_URL = 'ws://livekit:7880';
    process.env.LIVEKIT_RECORDINGS_S3_ENDPOINT = 'http://recordings:8333';
    process.env.LIVEKIT_RECORDINGS_S3_BUCKET = 'livekit-egress';
    mocks.repository.findActiveByRoom.mockResolvedValue([]);
    mocks.repository.findAllActive.mockResolvedValue([]);
    mocks.supportService.findChatGroup.mockResolvedValue(GROUP);
  });

  afterEach(() => {
    delete process.env.LIVEKIT_INTERNAL_URL;
    delete process.env.LIVEKIT_RECORDINGS_S3_ENDPOINT;
    delete process.env.LIVEKIT_RECORDINGS_S3_BUCKET;
    vi.unstubAllGlobals();
  });

  it('maps rooms to conversations and rejects org rooms', () => {
    expect(livekitService.conversationKeyForRoom(DIRECT_ROOM)).toBe('direct:user-a:user-b');
    expect(livekitService.conversationKeyForRoom(GROUP_ROOM)).toBe('group:group-1');
    expect(livekitService.conversationKeyForRoom(ORG_ROOM)).toBeNull();
  });

  it('starts a recording through the egress twirp API', async () => {
    const fetchMock = vi.fn(async () => twirpResponse({ egress_id: 'EG_1', status: 'EGRESS_ACTIVE' }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.repository.insert.mockImplementation(async (record) => ({ _id: 'rec-1', ...record }));

    const record = await livekitService.startRoomRecording(auth, DIRECT_ROOM);

    expect(record).toMatchObject({ egressId: 'EG_1', room: DIRECT_ROOM, conversationKey: 'direct:user-a:user-b', status: 'recording' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://livekit:7880/twirp/livekit.Egress/StartRoomCompositeEgress');
    expect(JSON.parse(init.body)).toMatchObject({
      room_name: DIRECT_ROOM,
      audio_only: false,
      file_outputs: [{ filepath_pattern: '{room_id}-{time}.mp4' }]
    });
  });

  it('rejects org rooms, foreign rooms, and double starts', async () => {
    // The caller's own org room passes admission (no active process in the
    // test auth) and fails on the missing conversation instead.
    await expect(livekitService.startRoomRecording(auth, 'call:org:org-1'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('no conversation') });

    await expect(livekitService.startRoomRecording(auth, 'call:direct:user-x:user-y'))
      .rejects.toMatchObject({ statusCode: 403 });

    mocks.repository.findActiveByRoom.mockResolvedValue([{ _id: 'rec-1', egressId: 'EG_1' }]);
    await expect(livekitService.startRoomRecording(auth, DIRECT_ROOM))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('stops every active egress of an admitted room and 404s idle rooms', async () => {
    const fetchMock = vi.fn(async () => twirpResponse({ egressId: 'EG_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(livekitService.stopRoomRecording(auth, DIRECT_ROOM))
      .rejects.toMatchObject({ statusCode: 404 });

    mocks.repository.findActiveByRoom.mockResolvedValue([
      { _id: 'rec-1', egressId: 'EG_1' },
      { _id: 'rec-2', egressId: 'EG_2' }
    ]);
    await expect(livekitService.stopRoomRecording(auth, DIRECT_ROOM))
      .resolves.toEqual({ room: DIRECT_ROOM, stopped: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ egressId: 'EG_1' });
  });

  it('lists only recordings of rooms the caller may enter', async () => {
    mocks.repository.findAllActive.mockResolvedValue([
      { room: DIRECT_ROOM, egressId: 'EG_1', startedByUserId: 'user-a', startedAt: new Date() },
      { room: 'call:direct:user-x:user-y', egressId: 'EG_2', startedByUserId: 'user-x', startedAt: new Date() }
    ]);

    const visible = await livekitService.listRoomRecordings(auth);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ room: DIRECT_ROOM, egressId: 'EG_1' });
  });

  it('imports ended egress files from the recordings store and marks completed', async () => {
    mocks.repository.findByEgressId.mockResolvedValue({
      _id: 'rec-1',
      egressId: 'EG_1',
      room: DIRECT_ROOM,
      conversationKey: 'direct:user-a:user-b',
      startedByUserId: 'user-a',
      status: 'recording'
    });
    const fetchMock = vi.fn(async () => new Response('mp4-bytes', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.filesService.uploadFile.mockResolvedValue({ id: 'gridfs-9', filename: 'call-recording-EG_1.mp4' });

    const result = await livekitService.publishWebhookEvent({
      event: 'egress_ended',
      egressInfo: {
        egressId: 'EG_1',
        roomName: DIRECT_ROOM,
        fileResults: [{ filename: '/recordings/room-123.mp4', duration: 42.6, size: 1000 }]
      }
    });

    expect(result).toEqual({ published: true });
    expect(fetchMock.mock.calls[0][0]).toBe('http://recordings:8333/livekit-egress/room-123.mp4');
    expect(mocks.filesService.uploadFile).toHaveBeenCalledWith(
      Buffer.from('mp4-bytes'),
      'call-recording-EG_1.mp4',
      expect.objectContaining({ kind: 'call-recording', room: DIRECT_ROOM })
    );
    expect(mocks.supportService.insertRecordingMessage).toHaveBeenCalledWith({
      conversationKey: 'direct:user-a:user-b',
      senderUserId: 'user-a',
      attachment: { kind: 'video', fileId: 'gridfs-9', mimeType: 'video/mp4', durationSeconds: 43 }
    });
    expect(mocks.repository.updateById).toHaveBeenCalledWith('rec-1', {
      $set: expect.objectContaining({ status: 'completed' })
    });
    expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-a', expect.objectContaining({
      type: 'call.activity',
      event: 'egress_ended',
      room: DIRECT_ROOM
    }));
    expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-b', expect.any(Object));
  });

  it('marks failed egress and survives import errors', async () => {
    mocks.repository.findByEgressId.mockResolvedValue({
      _id: 'rec-1',
      egressId: 'EG_1',
      room: GROUP_ROOM,
      conversationKey: 'group:group-1',
      startedByUserId: 'user-a',
      status: 'recording'
    });

    await livekitService.publishWebhookEvent({
      event: 'egress_failed',
      egressInfo: { egressId: 'EG_1', roomName: GROUP_ROOM }
    });
    expect(mocks.repository.updateById).toHaveBeenCalledWith('rec-1', {
      $set: expect.objectContaining({ status: 'failed' })
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('mp4-bytes', { status: 200 })));
    mocks.filesService.uploadFile.mockRejectedValue(new Error('gridfs down'));
    await livekitService.publishWebhookEvent({
      event: 'egress_ended',
      egressInfo: { egressId: 'EG_1', roomName: GROUP_ROOM, fileResults: [{ filename: 'x.mp4' }] }
    });
    expect(mocks.repository.updateById).toHaveBeenLastCalledWith('rec-1', {
      $set: expect.objectContaining({ status: 'failed' })
    });
  });

  it('ignores egress events for unknown rooms and recordings', async () => {
    mocks.repository.findByEgressId.mockResolvedValue(null);
    await expect(livekitService.publishWebhookEvent({
      event: 'egress_ended',
      egressInfo: { egressId: 'EG_404', roomName: DIRECT_ROOM, fileResults: [] }
    })).resolves.toEqual({ published: true });
    expect(mocks.filesService.uploadFile).not.toHaveBeenCalled();

    await expect(livekitService.publishWebhookEvent({
      event: 'egress_started',
      egressInfo: { egressId: '', roomName: '' }
    })).resolves.toEqual({ published: false });
  });
});
