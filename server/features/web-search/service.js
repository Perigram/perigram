import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';
import { egressFetch } from '~/server/features/llm/service.js';

const PROVIDERS = new Set(['searxng', 'tavily']);
const TAVILY_BASE_URL = 'https://api.tavily.com';
const REQUEST_TIMEOUT_MS = 20000;
const RESULTS_DEFAULT = 5;
const RESULTS_MAX = 10;

function providerEnvConfig(provider) {
    if (provider === 'searxng') {
        return {
            baseUrl: (process.env.WEB_SEARCH_SEARXNG_BASE_URL || '').trim(),
            apiKey: ''
        };
    }
    return {
        baseUrl: (process.env.WEB_SEARCH_TAVILY_BASE_URL || TAVILY_BASE_URL).trim(),
        apiKey: (process.env.WEB_SEARCH_TAVILY_API_KEY || '').trim()
    };
}

async function orgWebSearchSetting(organizationId) {
    const id = organizationId?.toString?.().trim?.() || '';
    if (!id) return null;
    try {
        const org = await organizationsService.getById(id);
        const setting = org?.data?.settings?.webSearch;
        return setting && typeof setting === 'object' ? setting : null;
    } catch {
        return null;
    }
}

/**
 * Provider resolution merges the organization's `data.settings.webSearch`
 * over the environment defaults (see the web-search README for the table).
 * A selected provider that cannot work — `searxng` without a base URL,
 * `tavily` without an API key — resolves to `{ provider: 'none' }` so
 * consumers treat search as unavailable instead of failing per request.
 */
export async function resolveWebSearchConfig(organizationId = null) {
    const setting = await orgWebSearchSetting(organizationId);
    const requested = String(setting?.provider ?? process.env.WEB_SEARCH_PROVIDER ?? 'none').trim();
    const provider = PROVIDERS.has(requested) ? requested : 'none';
    if (provider === 'none') return { provider: 'none' };
    const env = providerEnvConfig(provider);
    const baseUrl = String(setting?.baseUrl || '').trim() || env.baseUrl;
    const apiKey = String(setting?.apiKey || '').trim() || env.apiKey;
    if (!baseUrl || (provider === 'tavily' && !apiKey)) return { provider: 'none' };
    return { provider, baseUrl, apiKey };
}

export async function isWebSearchAvailable(organizationId = null) {
    return (await resolveWebSearchConfig(organizationId)).provider !== 'none';
}

/**
 * One neutral search over the configured provider (see the web-search
 * README for the wire contracts): `searxng` reads the instance's JSON
 * API, `tavily` posts its search endpoint with the org's key. Results
 * carry title, url, and snippet only — the neutral shape every consumer
 * serves.
 */
export async function webSearch({ organizationId = null, query, maxResults = RESULTS_DEFAULT, signal = null }) {
    const config = await resolveWebSearchConfig(organizationId);
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'Web search is not configured' });
    }
    const searchQuery = String(query || '').trim();
    if (!searchQuery) throw createError({ statusCode: 400, message: 'Query is required' });
    const limit = Math.min(Math.max(Number.parseInt(maxResults, 10) || RESULTS_DEFAULT, 1), RESULTS_MAX);
    const searxng = config.provider === 'searxng';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // The caller's stop cancels the request beside the idle timeout — a
    // stopped room must not wait out a hanging provider.
    const requestSignal = signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal;
    let response;
    try {
        if (searxng) {
            response = await egressFetch(
                `${config.baseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(searchQuery)}&format=json`,
                { signal: requestSignal }
            );
        } else {
            response = await egressFetch(`${config.baseUrl.replace(/\/+$/, '')}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({ query: searchQuery, max_results: limit }),
                signal: requestSignal
            });
        }
    } catch (error) {
        throw createError({ statusCode: 502, message: 'Web search service is unreachable' });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw createError({
            statusCode: 502,
            message: detail ? `Web search service error: ${detail}` : 'Web search service error'
        });
    }
    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    const results = rows
        .map(row => ({
            title: String(row?.title || '').trim(),
            url: String(row?.url || '').trim(),
            snippet: String(row?.content || '').trim()
        }))
        .filter(row => row.title || row.url)
        .slice(0, limit);
    return { provider: config.provider, results };
}

// --- Organization settings ----------------------------------------------------

export async function readWebSearchSettings(auth = {}) {
    const organizationId = auth.organizationId;
    const saved = await organizationsService.readSettingsSection(organizationId, 'webSearch', auth).catch(() => null);
    return {
        provider: String(saved?.provider || 'none'),
        baseUrl: String(saved?.baseUrl || ''),
        // Keys never travel: reads report presence only (the llm settings law).
        apiKeySet: Boolean(saved?.apiKey),
        envDefaults: {
            provider: String(process.env.WEB_SEARCH_PROVIDER || 'none'),
            baseUrl: String(process.env.WEB_SEARCH_SEARXNG_BASE_URL || '')
        }
    };
}

export async function saveWebSearchSettings(auth = {}, payload = {}) {
    const organizationId = auth.organizationId;
    if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
    const previous = await organizationsService.readSettingsSection(organizationId, 'webSearch', auth).catch(() => null) || {};
    const provider = String(payload?.provider ?? 'none').trim();
    if (provider !== 'none' && !PROVIDERS.has(provider)) {
        throw createError({ statusCode: 400, message: 'Provider must be searxng, tavily, or none' });
    }
    const baseUrl = String(payload?.baseUrl ?? '').trim();
    if (provider === 'searxng' && !baseUrl) {
        throw createError({ statusCode: 400, message: 'SearXNG needs its base URL' });
    }
    // An omitted key keeps the stored one; an empty string clears it.
    const apiKey = payload?.apiKey === undefined
        ? String(previous.apiKey || '')
        : String(payload.apiKey || '');
    await organizationsService.updateSettingsSection(organizationId, 'webSearch', { provider, baseUrl, apiKey }, auth);
    return await readWebSearchSettings(auth);
}

export async function testWebSearch(auth = {}) {
    const config = await resolveWebSearchConfig(auth.organizationId);
    if (config.provider === 'none') return { ok: false, reason: 'Web search is not configured' };
    try {
        const { results } = await webSearch({ organizationId: auth.organizationId, query: 'test' });
        return { ok: true, provider: config.provider, results: results.length };
    } catch (error) {
        return { ok: false, provider: config.provider, reason: error?.message || String(error) };
    }
}
