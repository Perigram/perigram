import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  organizationsService: { getById: vi.fn(async () => null) },
  usersService: { getById: vi.fn(async () => null) },
  filesService: { getFileBuffer: vi.fn() },
  transcriptionService: { transcribeAudio: vi.fn() },
  supportService: { insertRecordingMessage: vi.fn(), findChatGroup: vi.fn(async () => null) }
}));

vi.mock('~/server/features/organizations/service.js', () => mocks.organizationsService);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/files/service.js', () => mocks.filesService);
vi.mock('~/server/features/transcription/service.js', () => mocks.transcriptionService);
vi.mock('~/server/features/support/service.js', () => mocks.supportService);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as meetingsService from './service.js';

const ENV_KEYS = ['MEETINGS_LLM_BASE_URL', 'MEETINGS_LLM_MODEL', 'MEETINGS_LLM_API_KEY'];
const savedEnv = {};

const RECORD = {
  egressId: 'EG_1',
  conversationKey: 'direct:user-a:user-b',
  startedByUserId: 'user-a'
};

const llmResponse = (content) => new Response(JSON.stringify({
  choices: [{ message: { content } }]
}), { status: 200 });

describe('meetings service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
      delete savedEnv[key];
    }
    vi.unstubAllGlobals();
  });

  it('disables summaries without a model endpoint', async () => {
    await expect(meetingsService.resolveMeetingsConfig('org-1'))
      .resolves.toEqual({ enabled: false });
    await expect(meetingsService.summarizeRecording({ record: RECORD, message: {} }))
      .resolves.toBeNull();
    expect(mocks.transcriptionService.transcribeAudio).not.toHaveBeenCalled();
  });

  it('prefers organization settings over environment defaults', async () => {
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { meetings: { enabled: true, botUserId: 'user-bot', model: 'custom' } } }
    });
    process.env.MEETINGS_LLM_BASE_URL = 'http://llm:31136/v1';
    process.env.MEETINGS_LLM_MODEL = 'env-model';

    await expect(meetingsService.resolveMeetingsConfig('org-1')).resolves.toMatchObject({
      enabled: true,
      baseUrl: 'http://llm:31136/v1',
      model: 'custom',
      botUserId: 'user-bot',
      protocol: expect.stringContaining('summary')
    });
  });

  it('summarizes a recording through STT and the chat model', async () => {
    process.env.MEETINGS_LLM_BASE_URL = 'http://llm:31136/v1';
    process.env.MEETINGS_LLM_MODEL = 'qwen3:4b';
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'we decided to ship', provider: 'local', model: '' });
    mocks.supportService.insertRecordingMessage.mockResolvedValue({ _id: 'msg-2' });
    const fetchMock = vi.fn(async () => llmResponse('  Decisions: ship.  '));
    vi.stubGlobal('fetch', fetchMock);

    const message = await meetingsService.summarizeRecording({
      record: RECORD,
      message: { attachment: { fileId: 'gridfs-9', mimeType: 'video/mp4' } }
    });

    expect(message).toMatchObject({ _id: 'msg-2' });
    expect(mocks.transcriptionService.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'call-recording-EG_1.mp4',
      mimeType: 'video/mp4',
      organizationId: 'org-1'
    }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm:31136/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('qwen3:4b');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toMatchObject({ role: 'user', content: 'we decided to ship' });
    expect(mocks.supportService.insertRecordingMessage).toHaveBeenCalledWith({
      conversationKey: 'direct:user-a:user-b',
      senderUserId: 'user-a',
      message: 'Decisions: ship.'
    });
  });

  it('posts as the org bot when configured', async () => {
    process.env.MEETINGS_LLM_BASE_URL = 'http://llm:31136/v1';
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { meetings: { enabled: true, botUserId: 'user-bot' } } }
    });
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'hello', provider: 'local', model: '' });
    mocks.supportService.insertRecordingMessage.mockResolvedValue({ _id: 'msg-3' });
    vi.stubGlobal('fetch', vi.fn(async () => llmResponse('Summary')));

    await meetingsService.summarizeRecording({
      record: RECORD,
      message: { attachment: { fileId: 'gridfs-9' } }
    });

    expect(mocks.supportService.insertRecordingMessage).toHaveBeenCalledWith(expect.objectContaining({
      senderUserId: 'user-bot',
      message: 'Summary'
    }));
  });

  it('skips silently on empty transcripts and survives model failures', async () => {
    process.env.MEETINGS_LLM_BASE_URL = 'http://llm:31136/v1';
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: '', provider: 'local', model: '' });

    await expect(meetingsService.summarizeRecording({ record: RECORD, message: { attachment: { fileId: 'f' } } }))
      .resolves.toBeNull();
    expect(mocks.supportService.insertRecordingMessage).not.toHaveBeenCalled();

    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'speech', provider: 'local', model: '' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(meetingsService.summarizeRecording({ record: RECORD, message: { attachment: { fileId: 'f' } } }))
      .resolves.toBeNull();
    expect(mocks.supportService.insertRecordingMessage).not.toHaveBeenCalled();
  });
});
