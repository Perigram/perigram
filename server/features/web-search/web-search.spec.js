import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The web-search capability contract, pinned: provider resolution (the
// org setting over the environment, unusable selections resolving to
// none), the two provider wires (SearXNG JSON GET, Tavily keyed POST),
// the 503/502 posture, result bounding, and the settings key law (keys
// never travel; an omitted key keeps the stored one).

const { mockedOrganizations } = vi.hoisted(() => ({
    mockedOrganizations: {
        getById: vi.fn(),
        readSettingsSection: vi.fn(),
        updateSettingsSection: vi.fn()
    }
}));

vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);

import * as webSearch from './service.js';

const AUTH = { userId: 'user-1', organizationId: 'org-1' };
const fetchMock = vi.fn();
const ENV_VARS = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
    'WEB_SEARCH_PROVIDER', 'WEB_SEARCH_SEARXNG_BASE_URL',
    'WEB_SEARCH_TAVILY_BASE_URL', 'WEB_SEARCH_TAVILY_API_KEY'
];
let savedEnv = {};

beforeEach(() => {
    vi.clearAllMocks();
    for (const name of ENV_VARS) {
        savedEnv[name] = process.env[name];
        delete process.env[name];
    }
    mockedOrganizations.getById.mockResolvedValue(null);
    mockedOrganizations.readSettingsSection.mockResolvedValue(null);
    mockedOrganizations.updateSettingsSection.mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    savedEnv = {};
});

const orgWithSetting = (setting) => ({
    data: { settings: { webSearch: setting } }
});

describe('resolveWebSearchConfig', () => {
    it('resolves to none by default and for unusable selections', async () => {
        expect(await webSearch.resolveWebSearchConfig('org-1')).toEqual({ provider: 'none' });
        process.env.WEB_SEARCH_PROVIDER = 'searxng';
        expect(await webSearch.resolveWebSearchConfig('org-1')).toEqual({ provider: 'none' });
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'tavily', apiKey: '' }));
        expect(await webSearch.resolveWebSearchConfig('org-1')).toEqual({ provider: 'none' });
    });

    it('merges the organization setting over the environment', async () => {
        process.env.WEB_SEARCH_PROVIDER = 'searxng';
        process.env.WEB_SEARCH_SEARXNG_BASE_URL = 'http://env-instance:8888';
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'searxng', baseUrl: 'http://org-instance:8888/' }));
        expect(await webSearch.resolveWebSearchConfig('org-1')).toEqual({
            provider: 'searxng',
            baseUrl: 'http://org-instance:8888/',
            apiKey: ''
        });
    });
});

describe('webSearch', () => {
    it('throws 503 when unresolved', async () => {
        await expect(webSearch.webSearch({ organizationId: 'org-1', query: 'q' })).rejects.toMatchObject({ statusCode: 503 });
    });

    it('queries the SearXNG JSON API and returns the neutral result shape', async () => {
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'searxng', baseUrl: 'http://sx:8888' }));
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ results: [
                { title: 'Perigram', url: 'https://example.com', content: 'A process platform.' },
                { title: '', url: '', content: 'dropped: neither title nor url' }
            ] })
        });
        const result = await webSearch.webSearch({ organizationId: 'org-1', query: 'perigram process' });
        expect(result).toEqual({
            provider: 'searxng',
            results: [{ title: 'Perigram', url: 'https://example.com', snippet: 'A process platform.' }]
        });
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('http://sx:8888/search?q=perigram%20process&format=json');
        expect(options.method).toBeUndefined();
    });

    it('posts the Tavily wire with the bearer key and bounded results', async () => {
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'tavily', apiKey: 'tv-1' }));
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ results: [{ title: 'A', url: 'https://a', content: 'a' }, { title: 'B', url: 'https://b', content: 'b' }] })
        });
        const result = await webSearch.webSearch({ organizationId: 'org-1', query: 'q', maxResults: 1 });
        expect(result.provider).toBe('tavily');
        expect(result.results).toHaveLength(1);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.tavily.com/search');
        expect(options.headers.Authorization).toBe('Bearer tv-1');
        expect(JSON.parse(options.body)).toEqual({ query: 'q', max_results: 1 });
    });

    it('surfaces endpoint failures: 502 with the service\'s own detail', async () => {
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'tavily', apiKey: 'tv-1' }));
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'invalid key' });
        await expect(webSearch.webSearch({ organizationId: 'org-1', query: 'q' })).rejects.toMatchObject({
            statusCode: 502,
            message: expect.stringContaining('invalid key')
        });
        fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(webSearch.webSearch({ organizationId: 'org-1', query: 'q' })).rejects.toMatchObject({ statusCode: 502 });
    });
});

describe('settings and test', () => {
    it('reads mask the key and saves keep an omitted one', async () => {
        mockedOrganizations.readSettingsSection.mockResolvedValue({ provider: 'tavily', baseUrl: '', apiKey: 'tv-1' });
        const read = await webSearch.readWebSearchSettings(AUTH);
        expect(read).toMatchObject({ provider: 'tavily', apiKeySet: true });
        expect(JSON.stringify(read)).not.toContain('tv-1');
        await webSearch.saveWebSearchSettings(AUTH, { provider: 'tavily' });
        expect(mockedOrganizations.updateSettingsSection).toHaveBeenCalledWith('org-1', 'webSearch', { provider: 'tavily', baseUrl: '', apiKey: 'tv-1' }, AUTH);
    });

    it('rejects a provider-less SearXNG selection', async () => {
        await expect(webSearch.saveWebSearchSettings(AUTH, { provider: 'searxng', baseUrl: '' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('the connection test reports one real round', async () => {
        mockedOrganizations.getById.mockResolvedValue(orgWithSetting({ provider: 'searxng', baseUrl: 'http://sx:8888' }));
        const ok = await webSearch.testWebSearch(AUTH);
        expect(ok).toEqual({ ok: true, provider: 'searxng', results: 0 });
        fetchMock.mockRejectedValueOnce(new Error('down'));
        const failed = await webSearch.testWebSearch(AUTH);
        expect(failed.ok).toBe(false);
        expect(failed.reason).toBeTruthy();
    });
});
