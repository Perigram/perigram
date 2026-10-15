import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Named profiles with capability routing, pinned: the route chain
// (exact → chat family → env), image profiles never serving chat,
// validation (ids, providers, required fields, route targets), key
// masking and keep/clear semantics, and the per-profile connection test
// that reports instead of throwing.

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

import { resolveLlmConfig, readLlmSettings, saveLlmSettings, testLlmConnection, chatProfileIds } from './service.js';

const AUTH = { userId: 'admin-1', organizationId: 'org-1' };

const ENV_KEYS = ['LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];
const envBackup = {};

const withSetting = (setting) => {
    mockedOrganizations.getById.mockResolvedValue({ data: { settings: { llm: setting } } });
    mockedOrganizations.readSettingsSection.mockResolvedValue(setting);
};

beforeEach(() => {
    vi.clearAllMocks();
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

describe('resolveLlmConfig: the route chain', () => {
    it('uses the exact capability route first', async () => {
        withSetting({
            profiles: {
                fast: { kind: 'chat', provider: 'ollama', baseUrl: 'http://fast:11434', model: 'qwen3:8b' },
                big: { kind: 'chat', provider: 'anthropic', baseUrl: 'https://big', model: 'glm-4.7', apiKey: 'k' }
            },
            routes: { chat: 'fast', 'chat.summaries': 'big' }
        });
        await expect(resolveLlmConfig('org-1', 'chat.summaries')).resolves.toMatchObject({ provider: 'anthropic', model: 'glm-4.7' });
        await expect(resolveLlmConfig('org-1', 'chat')).resolves.toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
        await expect(resolveLlmConfig('org-1')).resolves.toMatchObject({ provider: 'ollama' });
    });

    it('falls back to the chat family, then the environment', async () => {
        withSetting({
            profiles: { fast: { kind: 'chat', provider: 'ollama', baseUrl: 'http://fast:11434', model: 'qwen3:8b' } },
            routes: { chat: 'fast' }
        });
        await expect(resolveLlmConfig('org-1', 'chat.summaries')).resolves.toMatchObject({ provider: 'ollama' });

        withSetting(null);
        process.env.LLM_PROVIDER = 'ollama';
        process.env.LLM_BASE_URL = 'http://env:11434';
        process.env.LLM_MODEL = 'env-model';
        await expect(resolveLlmConfig('org-1', 'chat.summaries')).resolves.toMatchObject({ provider: 'ollama', baseUrl: 'http://env:11434' });
    });

    it('an explicit profile (a bot\'s declared brain) wins over any route', async () => {
        withSetting({
            profiles: {
                fast: { kind: 'chat', provider: 'ollama', baseUrl: 'http://fast:11434', model: 'qwen3:8b' },
                big: { kind: 'chat', provider: 'anthropic', baseUrl: 'https://big', model: 'glm-4.7' }
            },
            routes: { chat: 'fast' }
        });
        await expect(resolveLlmConfig('org-1', 'chat', { profileId: 'big' })).resolves.toMatchObject({ provider: 'anthropic', model: 'glm-4.7' });
    });

    it('a stale or non-chat explicit profile degrades to the route chain', async () => {
        withSetting({
            profiles: {
                fast: { kind: 'chat', provider: 'ollama', baseUrl: 'http://fast:11434', model: 'qwen3:8b' },
                images: { kind: 'image', provider: 'openai', baseUrl: 'http://img:8080', model: 'sd-xl' }
            },
            routes: { chat: 'fast' }
        });
        await expect(resolveLlmConfig('org-1', 'chat', { profileId: 'deleted-long-ago' })).resolves.toMatchObject({ provider: 'ollama' });
        await expect(resolveLlmConfig('org-1', 'chat', { profileId: 'images' })).resolves.toMatchObject({ provider: 'ollama' });
    });

    it('lists chat profile ids for bot overrides', async () => {
        withSetting({
            profiles: {
                fast: { kind: 'chat', provider: 'ollama', baseUrl: 'http://fast:11434', model: 'qwen3:8b' },
                images: { kind: 'image', provider: 'openai', baseUrl: 'http://img:8080', model: 'sd-xl' }
            },
            routes: {}
        });
        await expect(chatProfileIds('org-1')).resolves.toEqual(['fast']);
    });

    it('never serves chat from an image profile, whatever the route says', async () => {
        withSetting({
            profiles: { images: { kind: 'image', provider: 'openai', baseUrl: 'http://img:8080', model: 'sd-xl' } },
            routes: { chat: 'images' }
        });
        await expect(resolveLlmConfig('org-1')).resolves.toEqual({ provider: 'none' });
    });
});

describe('readLlmSettings', () => {
    it('masks keys and exposes finite routes', async () => {
        withSetting({
            profiles: {
                big: { kind: 'chat', provider: 'anthropic', baseUrl: 'https://big', model: 'glm-4.7', apiKey: 'secret' },
                images: { kind: 'image', provider: 'openai', baseUrl: 'http://img:8080', model: 'sd-xl' }
            },
            routes: { chat: 'big', 'chat.summaries': 'big', bogus: 'big' }
        });
        const result = await readLlmSettings(AUTH);
        expect(result.profiles).toHaveLength(2);
        expect(result.profiles.find(profile => profile.id === 'big')).toMatchObject({ apiKeySet: true, kind: 'chat' });
        expect(result.profiles.find(profile => profile.id === 'images')).toMatchObject({ kind: 'image', apiKeySet: false });
        expect(result.routes).toEqual({ chat: 'big', 'chat.summaries': 'big' });
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    it('reports an empty org as env-only with the resolved default', async () => {
        withSetting(null);
        const result = await readLlmSettings(AUTH);
        expect(result.profiles).toEqual([]);
        expect(result.routes).toEqual({ chat: '', 'chat.summaries': '' });
        expect(result.resolved).toEqual({ provider: 'none' });
    });
});

describe('saveLlmSettings', () => {
    it('validates ids, providers, and required fields', async () => {
        await expect(saveLlmSettings(AUTH, { profiles: [{ id: 'bad id!', kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm' }] }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { profiles: [{ id: 'p1', kind: 'chat', provider: 'gpt', baseUrl: 'b', model: 'm' }] }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { profiles: [{ id: 'p1', kind: 'chat', provider: 'ollama', baseUrl: '', model: 'm' }] }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { profiles: [
            { id: 'p1', kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm' },
            { id: 'p1', kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm' }
        ] })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('keeps a stored key on omit, clears on empty, stores verbatim', async () => {
        withSetting({
            profiles: { p1: { kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm', apiKey: 'kept' } },
            routes: {}
        });
        const row = { id: 'p1', kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm' };
        await saveLlmSettings(AUTH, { profiles: [row] });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[0][2].profiles.p1.apiKey).toBe('kept');

        await saveLlmSettings(AUTH, { profiles: [{ ...row, apiKey: '' }] });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[1][2].profiles.p1.apiKey).toBeUndefined();

        await saveLlmSettings(AUTH, { profiles: [{ ...row, apiKey: 'fresh' }] });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[2][2].profiles.p1.apiKey).toBe('fresh');
    });

    it('rejects routes naming unknown or non-chat profiles', async () => {
        const row = { id: 'p1', kind: 'chat', provider: 'ollama', baseUrl: 'b', model: 'm' };
        await expect(saveLlmSettings(AUTH, { profiles: [row], routes: { chat: 'nope' } }))
            .rejects.toMatchObject({ statusCode: 400 });
        await expect(saveLlmSettings(AUTH, { profiles: [{ id: 'img', kind: 'image', provider: 'openai', baseUrl: 'b', model: 'm' }], routes: { chat: 'img' } }))
            .rejects.toMatchObject({ statusCode: 400 });
        await saveLlmSettings(AUTH, { profiles: [row], routes: { chat: 'p1', 'chat.summaries': 'p1' } });
        expect(mockedOrganizations.updateSettingsSection.mock.calls[0][2].routes).toEqual({ chat: 'p1', 'chat.summaries': 'p1' });
    });
});

describe('testLlmConnection', () => {
    it('reports unconfigured and unknown targets instead of throwing', async () => {
        withSetting(null);
        await expect(testLlmConnection(AUTH)).resolves.toMatchObject({ ok: false });
        withSetting({ profiles: { img: { kind: 'image', provider: 'openai', baseUrl: 'b', model: 'm' } }, routes: {} });
        await expect(testLlmConnection(AUTH, { profileId: 'img' })).resolves.toMatchObject({ ok: false });
        await expect(testLlmConnection(AUTH, { profileId: 'missing' })).resolves.toMatchObject({ ok: false });
    });

    it('tests one saved chat profile by id with one real round', async () => {
        withSetting({
            profiles: { local: { kind: 'chat', provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' } },
            routes: { chat: 'local' }
        });
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ message: { role: 'assistant', content: 'ok' } }) }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await testLlmConnection(AUTH, { profileId: 'local' });
            expect(result).toEqual({ ok: true, provider: 'ollama', model: 'qwen3:8b' });
            expect(fetchMock.mock.calls[0][0]).toBe('http://llm:11434/api/chat');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reports endpoint failures with their reason', async () => {
        withSetting({
            profiles: { local: { kind: 'chat', provider: 'ollama', baseUrl: 'http://llm:11434', model: 'qwen3:8b' } },
            routes: { chat: 'local' }
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })));
        try {
            const result = await testLlmConnection(AUTH, { profileId: 'local' });
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/boom/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
