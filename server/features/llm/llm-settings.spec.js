import { describe, it, expect, beforeEach, vi } from 'vitest';

// Administered provider settings, pinned: unknown providers are refused,
// a selected provider requires base URL and model, the stored key survives
// saves that omit it and clears on empty string, reads never expose keys,
// and the connection test reports instead of throwing.

const { mockedOrganizations } = vi.hoisted(() => ({
    mockedOrganizations: {
        getById: vi.fn(async () => null),
        readSettingsSection: vi.fn(async () => null),
        updateSettingsSection: vi.fn(async () => ({}))
    }
}));

vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        return error;
    })
}));

import { readLlmSettings, saveLlmSettings, testLlmConnection } from './service.js';

const AUTH = { userId: 'admin-1', organizationId: 'org-1' };

const ENV_KEYS = ['LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];
const envBackup = {};

beforeEach(() => {
    vi.clearAllMocks();
    mockedOrganizations.getById.mockResolvedValue(null);
    mockedOrganizations.readSettingsSection.mockResolvedValue(null);
    mockedOrganizations.updateSettingsSection.mockResolvedValue({});
    for (const key of ENV_KEYS) {
        envBackup[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (envBackup[key] === undefined) delete process.env[key];
        else process.env[key] = envBackup[key];
    }
});

describe('readLlmSettings', () => {
    it('masks the key and reports the resolved provider', async () => {
        const setting = { provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b', apiKey: 'secret' };
        mockedOrganizations.readSettingsSection.mockResolvedValue(setting);
        mockedOrganizations.getById.mockResolvedValue({ data: { settings: { llm: setting } } });
        const result = await readLlmSettings(AUTH);
        expect(result.saved).toEqual({ provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b', apiKeySet: true });
        expect(JSON.stringify(result)).not.toContain('secret');
        expect(result.resolved).toMatchObject({ provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' });
    });

    it('reports no saved section with env defaults visible', async () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://env:11434';
        process.env.LLM_MODEL = 'env-model';
        const result = await readLlmSettings(AUTH);
        expect(result.saved).toBeNull();
        expect(result.envDefaults).toEqual({ provider: 'ollama', baseUrl: 'http://env:11434', model: 'env-model' });
    });
});

describe('saveLlmSettings', () => {
    it('rejects unknown providers and incomplete selections', async () => {
        await expect(saveLlmSettings(AUTH, { provider: 'gpt-everywhere' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { provider: 'ollama', baseUrl: 'http://llm:11434' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { provider: 'ollama', model: 'm' })).rejects.toMatchObject({ statusCode: 400 });
        expect(mockedOrganizations.updateSettingsSection).not.toHaveBeenCalled();
    });

    it('saves a provider selection and keeps a previously stored key when omitted', async () => {
        mockedOrganizations.readSettingsSection.mockResolvedValue({
            provider: 'anthropic', baseUrl: 'https://old', model: 'old-model', apiKey: 'kept-secret'
        });
        await saveLlmSettings(AUTH, { provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' });
        const [, section, value] = mockedOrganizations.updateSettingsSection.mock.calls[0];
        expect(section).toBe('llm');
        expect(value).toEqual({ provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b', apiKey: 'kept-secret' });
    });

    it('clears the key on an explicit empty string and stores a new one verbatim', async () => {
        mockedOrganizations.readSettingsSection.mockResolvedValue({ provider: 'ollama', apiKey: 'old' });
        await saveLlmSettings(AUTH, { provider: 'ollama', baseUrl: 'http://llm:11434', model: 'm', apiKey: '' });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[0][2].apiKey).toBeUndefined();

        await saveLlmSettings(AUTH, { provider: 'ollama', baseUrl: 'http://llm:11434', model: 'm', apiKey: 'fresh' });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[1][2].apiKey).toBe('fresh');
    });

    it('saves the none provider as a bare selection', async () => {
        await saveLlmSettings(AUTH, { provider: 'none' });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[0][2]).toEqual({ provider: 'none' });
    });
});

describe('testLlmConnection', () => {
    const withSavedProvider = (setting) => {
        mockedOrganizations.readSettingsSection.mockResolvedValue(setting);
        mockedOrganizations.getById.mockResolvedValue({ data: { settings: { llm: setting } } });
    };

    it('reports unconfigured instead of throwing', async () => {
        const result = await testLlmConnection(AUTH);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/No provider/i);
    });

    it('performs one real completion round against the resolved provider', async () => {
        withSavedProvider({ provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' });
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ message: { role: 'assistant', content: 'ok' } })
        }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await testLlmConnection(AUTH);
            expect(result).toEqual({ ok: true, provider: 'ollama', model: 'qwen3:8b' });
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('http://llm:11434/api/chat');
            expect(JSON.parse(init.body).model).toBe('qwen3:8b');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reports endpoint failures with their reason', async () => {
        withSavedProvider({ provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' });
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })));
        try {
            const result = await testLlmConnection(AUTH);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/boom/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
