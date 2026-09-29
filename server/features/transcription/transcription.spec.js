import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  organizationsService: { getById: vi.fn(async () => null) }
}));

vi.mock('~/server/features/organizations/service.js', () => mocks.organizationsService);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as transcriptionService from './service.js';

const ENV_KEYS = [
  'TRANSCRIPTION_PROVIDER',
  'TRANSCRIPTION_LOCAL_BASE_URL',
  'TRANSCRIPTION_LOCAL_API_KEY',
  'TRANSCRIPTION_LANGUAGE',
  'TRANSCRIPTION_CLOUD_BASE_URL',
  'TRANSCRIPTION_CLOUD_API_KEY',
  'TRANSCRIPTION_MODEL'
];
const savedEnv = {};

describe('transcription service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    mocks.organizationsService.getById.mockResolvedValue(null);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
      delete savedEnv[key];
    }
    vi.unstubAllGlobals();
  });

  it('resolves to none without any configuration', async () => {
    await expect(transcriptionService.resolveTranscriptionConfig('org-1'))
      .resolves.toEqual({ provider: 'none' });
    expect(mocks.organizationsService.getById).toHaveBeenCalledWith('org-1');
  });

  it('prefers organization settings over environment defaults', async () => {
    mocks.organizationsService.getById.mockResolvedValue({
      data: { settings: { transcription: { provider: 'local', model: 'custom-model', language: 'de' } } }
    });
    process.env.TRANSCRIPTION_PROVIDER = 'cloud';
    process.env.TRANSCRIPTION_CLOUD_API_KEY = 'cloud-key';
    process.env.TRANSCRIPTION_LOCAL_BASE_URL = 'http://whisper:8080/v1';
    process.env.TRANSCRIPTION_LANGUAGE = 'ru';

    await expect(transcriptionService.resolveTranscriptionConfig('org-1')).resolves.toEqual({
      provider: 'local',
      baseUrl: 'http://whisper:8080/v1',
      apiKey: '',
      model: 'custom-model',
      language: 'de'
    });
  });

  it('resolves cloud through its default base url and treats a missing api key as unavailable', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'cloud';
    await expect(transcriptionService.resolveTranscriptionConfig(null))
      .resolves.toEqual({ provider: 'none' });

    process.env.TRANSCRIPTION_CLOUD_API_KEY = 'cloud-key';
    await expect(transcriptionService.resolveTranscriptionConfig(null)).resolves.toEqual({
      provider: 'cloud',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'cloud-key',
      model: 'whisper-1',
      language: ''
    });
  });

  it('rejects unknown providers as none', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'telepathy';
    await expect(transcriptionService.resolveTranscriptionConfig(null))
      .resolves.toEqual({ provider: 'none' });
  });

  it('transcribes through the local endpoint and joins segment texts', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'local';
    process.env.TRANSCRIPTION_LOCAL_BASE_URL = 'http://whisper:8080/v1';
    process.env.TRANSCRIPTION_LANGUAGE = 'ru';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      language: 'ru',
      duration_s: 2.4,
      rtf: 0.1,
      segments: [
        { start: 0, end: 1.1, text: '  hello ', words: [] },
        { start: 1.1, end: 2.4, text: 'there  ', words: [] }
      ]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm',
      organizationId: 'org-1'
    });

    expect(result).toEqual({ text: 'hello there', provider: 'local', model: '' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://whisper:8080/v1/transcribe');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({});
    expect(init.body.get('language')).toBe('ru');
    expect(init.body.get('model')).toBeNull();
    expect(init.body.get('file')).toBeInstanceOf(File);
    expect(init.body.get('file').name).toBe('voice-message.webm');
    expect(init.body.get('file').type).toBe('audio/webm');
  });

  it('sends bearer authorization and the model to the cloud endpoint', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'cloud';
    process.env.TRANSCRIPTION_CLOUD_API_KEY = 'cloud-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '  ok  ' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm'
    });

    expect(result).toEqual({ text: 'ok', provider: 'cloud', model: 'whisper-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer cloud-key' });
    expect(init.body.get('model')).toBe('whisper-1');
  });

  it('throws 503 when transcription is not configured', async () => {
    await expect(transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm'
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 502 when the endpoint is unreachable', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'local';
    process.env.TRANSCRIPTION_LOCAL_BASE_URL = 'http://whisper:8080/v1';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));

    await expect(transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm'
    })).rejects.toMatchObject({ statusCode: 502, message: 'Transcription service is unreachable' });
  });

  it('throws 502 carrying the provider detail when the endpoint rejects the audio', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'local';
    process.env.TRANSCRIPTION_LOCAL_BASE_URL = 'http://whisper:8080/v1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid audio format', { status: 400 })));

    await expect(transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm'
    })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('invalid audio format')
    });
  });

  it('returns empty text when the endpoint hears no speech', async () => {
    process.env.TRANSCRIPTION_PROVIDER = 'local';
    process.env.TRANSCRIPTION_LOCAL_BASE_URL = 'http://whisper:8080/v1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      language: 'ru',
      duration_s: 3.1,
      rtf: 0.1,
      segments: []
    }), { status: 200 })));

    await expect(transcriptionService.transcribeAudio({
      buffer: Buffer.from('audio-bytes'),
      filename: 'voice-message.webm',
      mimeType: 'audio/webm'
    })).resolves.toEqual({ text: '', provider: 'local', model: '' });
  });
});
