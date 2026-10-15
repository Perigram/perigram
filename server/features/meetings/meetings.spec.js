import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  organizationsService: { getById: vi.fn(async () => null) },
  usersService: { getById: vi.fn(async () => null) },
  filesService: { getFileBuffer: vi.fn() },
  transcriptionService: { transcribeAudio: vi.fn() },
  llmService: { isLlmAvailable: vi.fn(async () => true), chatCompletion: vi.fn() },
  supportService: { insertRecordingMessage: vi.fn(), findChatGroup: vi.fn(async () => null) }
}));

vi.mock('~/server/features/organizations/service.js', () => mocks.organizationsService);
vi.mock('~/server/features/users/service.js', () => mocks.usersService);
vi.mock('~/server/features/files/service.js', () => mocks.filesService);
vi.mock('~/server/features/transcription/service.js', () => mocks.transcriptionService);
vi.mock('~/server/features/llm/service.js', () => mocks.llmService);
vi.mock('~/server/features/support/service.js', () => mocks.supportService);

import * as meetingsService from './service.js';

const RECORD = {
  egressId: 'EG_1',
  conversationKey: 'direct:user-a:user-b',
  startedByUserId: 'user-a'
};

describe('meetings service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.llmService.isLlmAvailable.mockResolvedValue(true);
  });

  it('disables summaries without an LLM provider', async () => {
    mocks.llmService.isLlmAvailable.mockResolvedValue(false);
    await expect(meetingsService.resolveMeetingsConfig('org-1'))
      .resolves.toEqual({ enabled: false });
    await expect(meetingsService.summarizeRecording({ record: RECORD, message: {} }))
      .resolves.toBeNull();
    expect(mocks.transcriptionService.transcribeAudio).not.toHaveBeenCalled();
  });

  it('honors an explicit organization opt-out beside a working provider', async () => {
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { meetings: { enabled: false } } }
    });
    await expect(meetingsService.resolveMeetingsConfig('org-1'))
      .resolves.toEqual({ enabled: false });
  });

  it('keeps the meetings-owned config: protocol file and posting bot', async () => {
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { meetings: { enabled: true, botUserId: 'user-bot' } } }
    });
    await expect(meetingsService.resolveMeetingsConfig('org-1')).resolves.toMatchObject({
      enabled: true,
      botUserId: 'user-bot',
      protocol: expect.stringContaining('summary')
    });
  });

  it('summarizes a recording through STT and the shared LLM provider', async () => {
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'we decided to ship', provider: 'local', model: '' });
    mocks.llmService.chatCompletion.mockResolvedValue({ content: '  Decisions: ship.  ', toolCalls: [] });
    mocks.supportService.insertRecordingMessage.mockResolvedValue({ _id: 'msg-2' });

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
    expect(mocks.llmService.chatCompletion).toHaveBeenCalledWith({
      organizationId: 'org-1',
      capability: 'chat.summaries',
      system: expect.stringContaining('summary'),
      messages: [{ role: 'user', content: 'we decided to ship' }]
    });
    expect(mocks.supportService.insertRecordingMessage).toHaveBeenCalledWith({
      conversationKey: 'direct:user-a:user-b',
      senderUserId: 'user-a',
      message: 'Decisions: ship.'
    });
  });

  it('posts as the org bot when configured', async () => {
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { meetings: { enabled: true, botUserId: 'user-bot' } } }
    });
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'hello', provider: 'local', model: '' });
    mocks.llmService.chatCompletion.mockResolvedValue({ content: 'Summary', toolCalls: [] });
    mocks.supportService.insertRecordingMessage.mockResolvedValue({ _id: 'msg-3' });

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
    mocks.usersService.getById.mockResolvedValue({ data: { memberships: [{ organizationId: 'org-1' }] } });
    mocks.filesService.getFileBuffer.mockResolvedValue(Buffer.from('mp4'));
    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: '', provider: 'local', model: '' });

    await expect(meetingsService.summarizeRecording({ record: RECORD, message: { attachment: { fileId: 'f' } } }))
      .resolves.toBeNull();
    expect(mocks.supportService.insertRecordingMessage).not.toHaveBeenCalled();

    mocks.transcriptionService.transcribeAudio.mockResolvedValue({ text: 'speech', provider: 'local', model: '' });
    mocks.llmService.chatCompletion.mockRejectedValue(new Error('LLM service error: boom'));
    await expect(meetingsService.summarizeRecording({ record: RECORD, message: { attachment: { fileId: 'f' } } }))
      .resolves.toBeNull();
    expect(mocks.supportService.insertRecordingMessage).not.toHaveBeenCalled();
  });
});
