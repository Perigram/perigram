import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';

/**
 * LLM is a capability module over named model profiles with capability
 * routing (owner direction 2026-10-15: models live on different endpoints
 * per purpose — a fast local one, full-scale cloud ones, an image one).
 * The organization declares profiles and routes capabilities to them:
 *
 *     "llm": {
 *       "profiles": {
 *         "local-fast": { "kind": "chat", "provider": "ollama", "baseUrl": "http://a:11434", "model": "qwen3:8b" },
 *         "cloud-big":  { "kind": "chat", "provider": "anthropic", "baseUrl": "...", "model": "glm-4.7", "apiKey": "..." },
 *         "images":     { "kind": "image", "provider": "openai", "baseUrl": "http://img:8080", "model": "sd-xl" }
 *       },
 *       "routes": { "chat": "local-fast", "chat.summaries": "cloud-big" }
 *     }
 *
 * `resolveLlmConfig(organizationId, capability)` walks the route chain
 * (`chat.summaries` -> `chat` -> environment default) and returns the
 * profile's wire config. Consumers speak ONE neutral conversation
 * contract — system string, user/assistant/tool messages, structured tool
 * calls with object-valued arguments — and this module owns the
 * per-provider wire translation:
 *
 * | Provider   | Endpoint                     | Wire shape |
 * |---|---|---|
 * | `ollama`   | `{baseUrl}/api/chat`         | Native Ollama: function tools, object arguments, `message` response |
 * | `anthropic`| `{baseUrl}/v1/messages`      | Messages protocol: system field, content blocks, `tool_use`/`tool_result` |
 * | `openai`   | `{baseUrl}/chat/completions` | Chat-completions shape for local OpenAI-shaped servers (vLLM-style); no cloud default |
 *
 * Image-kind profiles are declarable today (endpoint, model, key) and
 * consumed when an image capability ships; speech-to-text is NOT part of
 * this module — transcription owns its own local/cloud providers (see
 * ../transcription/README.md). There is no default base URL: a chat
 * provider is usable only when both `baseUrl` and `model` resolve, and an
 * unusable route resolves to `{ provider: 'none' }` so consumers treat
 * the capability as unavailable instead of failing per request.
 *
 * Keys never travel: settings reads report `apiKeySet`, saves keep an
 * absent key and clear on empty string.
 */

const PROVIDERS = new Set(['ollama', 'anthropic', 'openai']);
const REQUEST_TIMEOUT_MS = 120000;
const ANTHROPIC_VERSION = '2023-06-01';

async function orgLlmSetting(organizationId) {
    const id = organizationId?.toString?.().trim?.() || '';
    if (!id) return null;
    try {
        const org = await organizationsService.getById(id);
        const setting = org?.data?.settings?.llm;
        return setting && typeof setting === 'object' ? setting : null;
    } catch {
        return null;
    }
}

function profileWireConfig(profile) {
    const provider = String(profile?.provider || '').trim();
    if (!PROVIDERS.has(provider)) return { provider: 'none' };
    const baseUrl = String(profile?.baseUrl || '').trim();
    const model = String(profile?.model || '').trim();
    const apiKey = String(profile?.apiKey || '').trim();
    if (!baseUrl || !model) return { provider: 'none' };
    return { provider, baseUrl, apiKey, model };
}

function envWireConfig() {
    const provider = String(process.env.LLM_PROVIDER || 'none').trim();
    if (!PROVIDERS.has(provider)) return { provider: 'none' };
    const baseUrl = String(process.env.LLM_BASE_URL || '').trim();
    const model = String(process.env.LLM_MODEL || '').trim();
    const apiKey = String(process.env.LLM_API_KEY || '').trim();
    if (!baseUrl || !model) return { provider: 'none' };
    return { provider, baseUrl, apiKey, model };
}

const CHAT_CAPABILITY = 'chat';

/**
 * The capability route chain: an exact route wins, then the `chat` family
 * default, then the environment default (an unrouted org runs on env).
 * Chat-kind profiles only — an image endpoint never serves a conversation.
 */
export async function resolveLlmConfig(organizationId = null, capability = CHAT_CAPABILITY, { profileId = '' } = {}) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    // An explicit profile (a bot's declared brain) wins before any route;
    // only chat-kind profiles serve conversations, everything else falls
    // through to the route chain so a stale reference degrades to the
    // org default instead of breaking the bot.
    const explicitId = String(profileId || '').trim();
    if (explicitId && profiles[explicitId]?.kind === 'chat') {
        const config = profileWireConfig(profiles[explicitId]);
        if (config.provider !== 'none') return config;
    }
    const routes = setting?.routes && typeof setting.routes === 'object' ? setting.routes : {};
    const family = String(capability || CHAT_CAPABILITY).split('.')[0];
    const routedId = routes[capability] ?? routes[family] ?? routes[CHAT_CAPABILITY] ?? null;
    const profile = routedId ? profiles[routedId] : null;
    if (profile?.kind === 'chat') {
        const config = profileWireConfig(profile);
        if (config.provider !== 'none') return config;
    }
    return envWireConfig();
}

/** The org's chat-kind profile ids — bot model-override validation. */
export async function chatProfileIds(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    return Object.entries(profiles)
        .filter(([, profile]) => profile?.kind === 'chat')
        .map(([id]) => String(id));
}

export async function isLlmAvailable(organizationId = null, capability = CHAT_CAPABILITY, options = {}) {
    return (await resolveLlmConfig(organizationId, capability, options)).provider !== 'none';
}

const PROFILE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;
const ROUTED_CAPABILITIES = ['chat', 'chat.summaries'];

function maskedProfile([id, profile = {}]) {
    return {
        id: String(id),
        kind: profile.kind === 'image' ? 'image' : 'chat',
        provider: String(profile.provider || ''),
        baseUrl: String(profile.baseUrl || ''),
        model: String(profile.model || ''),
        apiKeySet: Boolean(profile.apiKey)
    };
}

export async function readLlmSettings(auth = {}) {
    const organizationId = auth.organizationId;
    const saved = await organizationsService.readSettingsSection(organizationId, 'llm', auth).catch(() => null);
    const profiles = saved?.profiles && typeof saved.profiles === 'object' ? saved.profiles : {};
    const routes = saved?.routes && typeof saved.routes === 'object' ? saved.routes : {};
    // The resolved config carries the raw key for the wire path; the
    // settings read never ships it.
    const resolved = await resolveLlmConfig(organizationId);
    delete resolved.apiKey;
    return {
        profiles: Object.entries(profiles).map(maskedProfile),
        routes: Object.fromEntries(ROUTED_CAPABILITIES.map(capability => [capability, String(routes[capability] || '')])),
        resolved,
        envDefaults: {
            provider: String(process.env.LLM_PROVIDER || 'none'),
            baseUrl: String(process.env.LLM_BASE_URL || ''),
            model: String(process.env.LLM_MODEL || '')
        }
    };
}

export async function saveLlmSettings(auth = {}, payload = {}) {
    const organizationId = auth.organizationId;
    if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
    const previous = await organizationsService.readSettingsSection(organizationId, 'llm', auth).catch(() => null) || {};
    const previousProfiles = previous.profiles && typeof previous.profiles === 'object' ? previous.profiles : {};

    const rows = Array.isArray(payload?.profiles) ? payload.profiles : [];
    if (rows.length > 20) throw createError({ statusCode: 400, message: 'At most 20 model profiles' });
    const profiles = {};
    for (const row of rows) {
        const id = String(row?.id || '').trim();
        if (!PROFILE_ID_PATTERN.test(id)) {
            throw createError({ statusCode: 400, message: `Profile id must be a short slug: ${id || '(missing)'}` });
        }
        if (profiles[id]) throw createError({ statusCode: 400, message: `Duplicate profile id: ${id}` });
        const kind = row?.kind === 'image' ? 'image' : 'chat';
        const provider = String(row?.provider || '').trim();
        if (!PROVIDERS.has(provider)) {
            throw createError({ statusCode: 400, message: `Profile ${id}: provider must be ollama, anthropic, or openai` });
        }
        const baseUrl = String(row?.baseUrl || '').trim();
        const model = String(row?.model || '').trim();
        if (!baseUrl || !model) {
            throw createError({ statusCode: 400, message: `Profile ${id}: base URL and model are required` });
        }
        const profile = { kind, provider, baseUrl, model };
        if (row?.apiKey === undefined || row?.apiKey === null) {
            if (previousProfiles[id]?.apiKey) profile.apiKey = previousProfiles[id].apiKey;
        } else {
            const apiKey = String(row.apiKey).trim();
            if (apiKey) profile.apiKey = apiKey;
        }
        profiles[id] = profile;
    }

    const routes = {};
    const requestedRoutes = payload?.routes && typeof payload.routes === 'object' ? payload.routes : {};
    for (const capability of ROUTED_CAPABILITIES) {
        const target = String(requestedRoutes[capability] || '').trim();
        if (!target) continue;
        if (!profiles[target]) {
            throw createError({ statusCode: 400, message: `Route ${capability} names unknown profile: ${target}` });
        }
        if (profiles[target].kind !== 'chat') {
            throw createError({ statusCode: 400, message: `Route ${capability} must name a chat profile` });
        }
        routes[capability] = target;
    }

    await organizationsService.updateSettingsSection(organizationId, 'llm', { profiles, routes }, auth);
    return await readLlmSettings(auth);
}

/**
 * One real completion round: the profile card's connection test. Targets
 * one saved chat profile by id, or the resolved default route. Returns
 * `{ ok, provider?, model?, reason? }` — never throws, so the surface
 * reports instead of toasting.
 */
export async function testLlmConnection(auth = {}, { profileId = '' } = {}) {
    const organizationId = auth.organizationId;
    let config;
    const targetId = String(profileId || '').trim();
    if (targetId) {
        const saved = await organizationsService.readSettingsSection(organizationId, 'llm', auth).catch(() => null);
        const profile = saved?.profiles?.[targetId];
        if (profile?.kind !== 'chat') {
            return { ok: false, reason: 'Unknown chat profile' };
        }
        config = profileWireConfig(profile);
    } else {
        config = await resolveLlmConfig(organizationId);
    }
    if (config.provider === 'none') {
        return { ok: false, reason: 'No provider resolves — save a routed profile or check the environment defaults' };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(wireEndpoint(config.provider, config.baseUrl), {
                method: 'POST',
                headers: wireHeaders(config.provider, config.apiKey),
                body: JSON.stringify(wireRequest(config.provider, config, 'Reply with the single word: ok', [{ role: 'user', content: 'Reply with the single word: ok' }], [])),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }
        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
            return { ok: false, provider: config.provider, model: config.model, reason: detail ? `LLM service error: ${detail}` : 'LLM service error' };
        }
        const payload = await response.json().catch(() => null);
        if (!payload) return { ok: false, provider: config.provider, model: config.model, reason: 'LLM service returned no completion' };
        return { ok: true, provider: config.provider, model: config.model };
    } catch (error) {
        return { ok: false, provider: config.provider, model: config.model, reason: error?.message || 'Connection failed' };
    }
}

/**
 * The models an endpoint serves (the profile dialog's picker): Ollama
 * lists `/api/tags`, the OpenAI-shaped and Messages protocols list their
 * models collections. Credentials come inline (a not-yet-saved dialog
 * row) or from a saved profile by id — the stored key never travels to
 * the client either way.
 */
export async function listEndpointModels(auth = {}, { provider = '', baseUrl = '', apiKey = '', profileId = '' } = {}) {
    const organizationId = auth.organizationId;
    let resolvedProvider = String(provider || '').trim();
    let resolvedBaseUrl = String(baseUrl || '').trim();
    let resolvedApiKey = String(apiKey || '').trim();
    const targetId = String(profileId || '').trim();
    if (targetId) {
        const saved = await organizationsService.readSettingsSection(organizationId, 'llm', auth).catch(() => null);
        const profile = saved?.profiles?.[targetId];
        if (!profile) throw createError({ statusCode: 404, message: 'Unknown profile' });
        // The dialog's inline provider/baseUrl win (the row may be mid-edit);
        // the saved profile contributes only its stored key when the form
        // field is empty — the key itself never travels to the client.
        if (!resolvedProvider) resolvedProvider = profile.provider;
        if (!resolvedBaseUrl) resolvedBaseUrl = profile.baseUrl;
        if (!resolvedApiKey && profile.apiKey) resolvedApiKey = profile.apiKey;
    }
    if (!PROVIDERS.has(resolvedProvider)) {
        throw createError({ statusCode: 400, message: 'Provider must be ollama, anthropic, or openai' });
    }
    if (!resolvedBaseUrl) throw createError({ statusCode: 400, message: 'Base URL is required' });
    // Dialects lie: an OpenAI-shaped router behind an "ollama" pick, a base
    // URL that already ends in /v1, a minimal server with one listing
    // route. Probe the candidate paths in order and accept either listing
    // shape, so the picker fills instead of dead-ending on the first 404.
    const attempts = [];
    for (const url of listingCandidates(resolvedProvider, resolvedBaseUrl)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: wireHeaders(resolvedProvider, resolvedApiKey || undefined),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!response.ok) {
                attempts.push(`${url}: ${response.status}`);
                continue;
            }
            const payload = await response.json().catch(() => null);
            const models = endpointModelIds(payload);
            if (models.length) return { models, endpoint: url };
            attempts.push(`${url}: empty`);
        } catch (error) {
            clearTimeout(timeout);
            attempts.push(`${url}: unreachable`);
        }
    }
    throw createError({
        statusCode: 502,
        message: `No model listing found (tried ${attempts.join('; ')})`
    });
}

function listingCandidates(provider, baseUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (provider === 'ollama') return [`${base}/api/tags`, `${base}/v1/models`];
    if (provider === 'anthropic') return [`${base}/v1/models`];
    return [`${base}/v1/models`, `${base}/models`];
}

/**
 * Either listing shape, whatever path served it: Ollama tags name their
 * rows (`models[].name`), the OpenAI-shaped and Messages collections id
 * them (`data[].id`).
 */
function endpointModelIds(payload) {
    const fromTags = (Array.isArray(payload?.models) ? payload.models : [])
        .map(model => String(model?.name || model?.model || '').trim())
        .filter(Boolean);
    if (fromTags.length) return fromTags;
    return (Array.isArray(payload?.data) ? payload.data : [])
        .map(model => String(model?.id || '').trim())
        .filter(Boolean);
}

// --- Neutral → wire translation -------------------------------------------

function neutralToolsToWire(provider, tools = []) {
    if (!tools?.length) return null;
    if (provider === 'anthropic') {
        return tools.map(({ name, description, inputSchema }) => ({
            name, description, input_schema: inputSchema
        }));
    }
    // ollama and openai share the function-tool wrapper.
    return tools.map(({ name, description, inputSchema }) => ({
        type: 'function',
        function: { name, description, parameters: inputSchema }
    }));
}

function neutralMessagesToWire(provider, system, messages = []) {
    if (provider === 'ollama') {
        return [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...messages.map(neutralMessageToOllama)
        ];
    }
    if (provider === 'anthropic') {
        // Consecutive tool results merge into one user turn of tool_result
        // blocks: the messages protocol pairs a tool_use turn with the
        // immediately following user turn.
        const wire = [];
        for (const message of messages) {
            if (message.role === 'tool') {
                const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content };
                const last = wire[wire.length - 1];
                if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
                    last.content.push(block);
                } else {
                    wire.push({ role: 'user', content: [block] });
                }
                continue;
            }
            if (message.role === 'assistant' && message.toolCalls?.length) {
                wire.push({
                    role: 'assistant',
                    content: [
                        ...(message.content ? [{ type: 'text', text: message.content }] : []),
                        ...message.toolCalls.map((call) => ({
                            type: 'tool_use', id: call.id, name: call.name, input: call.arguments
                        }))
                    ]
                });
                continue;
            }
            wire.push({ role: message.role, content: message.content });
        }
        return wire;
    }
    return [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((message) => {
            if (message.role === 'tool') {
                return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
            }
            if (message.role === 'assistant' && message.toolCalls?.length) {
                return {
                    role: 'assistant',
                    content: message.content || '',
                    tool_calls: message.toolCalls.map((call) => ({
                        id: call.id,
                        type: 'function',
                        function: { name: call.name, arguments: JSON.stringify(call.arguments) }
                    }))
                };
            }
            return { role: message.role, content: message.content };
        })
    ];
}

function neutralMessageToOllama(message) {
    if (message.role === 'tool') {
        return { role: 'tool', tool_name: message.name, content: message.content };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
        return {
            role: 'assistant',
            content: message.content || '',
            tool_calls: message.toolCalls.map((call) => ({
                function: { name: call.name, arguments: call.arguments }
            }))
        };
    }
    return { role: message.role, content: message.content };
}

function parseJsonObject(text) {
    if (text && typeof text === 'object') return text;
    try {
        const parsed = JSON.parse(String(text || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function wireResponseToNeutral(provider, payload) {
    if (provider === 'ollama') {
        const message = payload?.message || {};
        return {
            content: typeof message.content === 'string' ? message.content : '',
            toolCalls: (message.tool_calls || []).map((call, index) => ({
                id: call.id || `ollama-${index}`,
                name: call.function?.name || '',
                arguments: parseJsonObject(call.function?.arguments)
            }))
        };
    }
    if (provider === 'anthropic') {
        const blocks = Array.isArray(payload?.content) ? payload.content : [];
        return {
            content: blocks
                .filter((block) => block.type === 'text' && typeof block.text === 'string')
                .map((block) => block.text)
                .join(''),
            toolCalls: blocks
                .filter((block) => block.type === 'tool_use')
                .map((block) => ({ id: block.id, name: block.name, arguments: block.input ?? {} }))
        };
    }
    const message = payload?.choices?.[0]?.message;
    return {
        content: typeof message?.content === 'string' ? message.content : '',
        toolCalls: (message?.tool_calls || []).map((call) => ({
            id: call.id,
            name: call.function?.name || '',
            arguments: parseJsonObject(call.function?.arguments)
        }))
    };
}

function wireRequest(provider, config, system, messages, tools) {
    const wireTools = neutralToolsToWire(provider, tools);
    if (provider === 'anthropic') {
        return {
            model: config.model,
            max_tokens: 4096,
            ...(system ? { system } : {}),
            messages: neutralMessagesToWire(provider, system, messages),
            ...(wireTools ? { tools: wireTools } : {})
        };
    }
    return {
        model: config.model,
        messages: neutralMessagesToWire(provider, system, messages),
        ...(wireTools ? { tools: wireTools } : {}),
        ...(provider === 'ollama' ? { stream: false } : {})
    };
}

function wireHeaders(provider, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (provider === 'anthropic') {
        // The version header is protocol identification, not auth; the key
        // itself is optional (local anthropic-shaped gateways may run open).
        return { ...headers, 'anthropic-version': ANTHROPIC_VERSION, ...(apiKey ? { 'x-api-key': apiKey } : {}) };
    }
    if (!apiKey) return headers;
    return { ...headers, Authorization: `Bearer ${apiKey}` };
}

function wireEndpoint(provider, baseUrl) {
    if (provider === 'ollama') return `${baseUrl.replace(/\/$/, '')}/api/chat`;
    if (provider === 'anthropic') return `${baseUrl.replace(/\/$/, '')}/v1/messages`;
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

/**
 * One chat-completion round in the neutral contract: `system` is a string,
 * `messages` are `{ role: 'user'|'assistant'|'tool', content, toolCalls?,
 * toolCallId?, name? }` (assistant `toolCalls` carry object `arguments`;
 * tool results carry the call id and name), `tools` are the catalog's
 * `{ name, description, inputSchema }` descriptors. Returns the neutral
 * assistant message `{ content, toolCalls }`. Throws 503 when unresolved,
 * 502 when the endpoint is unreachable, answers non-2xx, or returns no
 * completion. The agent loop that owns rounds lives with the consumer.
 */
export async function chatCompletion({ organizationId = null, capability = CHAT_CAPABILITY, profileId = '', system = '', messages = [], tools = [] }) {
    const config = await resolveLlmConfig(organizationId, capability, { profileId });
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'LLM provider is not configured' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(wireEndpoint(config.provider, config.baseUrl), {
            method: 'POST',
            headers: wireHeaders(config.provider, config.apiKey),
            body: JSON.stringify(wireRequest(config.provider, config, system, messages, tools)),
            signal: controller.signal
        });
    } catch (error) {
        throw createError({ statusCode: 502, message: 'LLM service is unreachable' });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw createError({
            statusCode: 502,
            message: detail ? `LLM service error: ${detail}` : 'LLM service error'
        });
    }
    const payload = await response.json().catch(() => null);
    if (!payload) throw createError({ statusCode: 502, message: 'LLM service returned no completion' });
    return wireResponseToNeutral(config.provider, payload);
}
