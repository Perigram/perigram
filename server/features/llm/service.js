import { createError } from 'h3';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import * as organizationsService from '~/server/features/organizations/service.js';

// One egress seam for every outbound LLM request (completions and model
// listings). Node's built-in fetch ignores proxy env, and container
// egress to cloud providers is proxy-gated in proxy-fronted networks —
// when proxy env is present, requests ride undici's env-aware agent
// (NO_PROXY honored, CIDR included, so LAN endpoints stay direct);
// otherwise the global fetch. Built once, lazily, from the process env.
let egressDispatcher = null;
export function egressFetch(url, options = {}) {
    const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy
        || process.env.HTTP_PROXY || process.env.http_proxy;
    if (!proxyEnv) return fetch(url, options);
    if (!egressDispatcher) egressDispatcher = new EnvHttpProxyAgent();
    return undiciFetch(url, { ...options, dispatcher: egressDispatcher });
}

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
// The idle guard on one request: time to first response bytes, and between
// stream chunks once streaming. `LLM_TIMEOUT_MS` overrides it.
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) > 0 ? Number(process.env.LLM_TIMEOUT_MS) : 120000;
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
export async function resolveLlmConfig(organizationId = null, capability = CHAT_CAPABILITY, { profileId = '', model = '' } = {}) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    // An explicit profile (a bot's declared brain) wins before any route;
    // only chat-kind profiles serve conversations, everything else falls
    // through to the route chain so a stale reference degrades to the
    // org default instead of breaking the bot.
    const explicitId = String(profileId || '').trim();
    // The execution point's model override: the profile still owns the
    // endpoint; the conversation picks which served model answers.
    const modelOverride = String(model || '').trim();
    if (explicitId && profiles[explicitId]?.kind === 'chat') {
        const config = profileWireConfig(profiles[explicitId]);
        if (config.provider !== 'none') return modelOverride ? { ...config, model: modelOverride } : config;
    }
    const routes = setting?.routes && typeof setting.routes === 'object' ? setting.routes : {};
    const family = String(capability || CHAT_CAPABILITY).split('.')[0];
    const routedId = routes[capability] ?? routes[family] ?? routes[CHAT_CAPABILITY] ?? null;
    let profile = routedId ? profiles[routedId] : null;
    if (!profile && !routedId) {
        // An unrouted org with exactly one chat profile serves it: a
        // configured model is the chat model unless routing says
        // otherwise. Two or more unrouted profiles stay ambiguous and
        // degrade to the environment.
        const unrouted = Object.values(profiles).filter(item => item?.kind === 'chat');
        if (unrouted.length === 1) profile = unrouted[0];
    }
    if (profile?.kind === 'chat') {
        const config = profileWireConfig(profile);
        if (config.provider !== 'none') return modelOverride ? { ...config, model: modelOverride } : config;
    }
    const env = envWireConfig();
    return modelOverride ? { ...env, model: modelOverride } : env;
}

/** The org's chat-kind profile ids — bot model-override validation. */
export async function chatProfileIds(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    return Object.entries(profiles)
        .filter(([, profile]) => profile?.kind === 'chat')
        .map(([id]) => String(id));
}

/**
 * Chat profiles with the model each routes to — the picker rows for chat
 * execution points, where the model is what the user is choosing.
 */
export async function chatProfiles(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    return Object.entries(profiles)
        .filter(([, profile]) => profile?.kind === 'chat')
        .map(([id, profile]) => ({ id: String(id), model: String(profile?.model || '') }));
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
        if (!baseUrl) {
            throw createError({ statusCode: 400, message: `Profile ${id}: base URL is required` });
        }
        const apiKey = row?.apiKey === undefined || row?.apiKey === null
            ? String(previousProfiles[id]?.apiKey || '').trim()
            : String(row.apiKey).trim();
        const profile = { kind, provider, baseUrl };
        if (apiKey) profile.apiKey = apiKey;
        // The model is derived data, never picked in profile setup: a login
        // keeps the endpoint's stored default while endpoint and key stand,
        // and a new (or re-pointed) login takes the first model its own
        // listing serves. Unreachable endpoints save without one and stay
        // unusable (resolution yields none) until a re-save or test reaches
        // them.
        profile.model = String(row?.model || '').trim();
        if (!profile.model) {
            const sameEndpoint = previousProfiles[id]?.baseUrl === baseUrl && previousProfiles[id]?.provider === provider;
            profile.model = sameEndpoint ? String(previousProfiles[id]?.model || '').trim() : '';
        }
        if (!profile.model) {
            try {
                profile.model = (await probeEndpointModels(provider, baseUrl, apiKey)).models[0] || '';
            } catch {
                profile.model = '';
            }
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
        const { release } = await openCompletion(config, JSON.stringify(wireRequest(
            config.provider, config,
            'Reply with the single word: ok',
            [{ role: 'user', content: 'Reply with the single word: ok' }],
            []
        )));
        release();
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
    const { models, endpoint } = await probeEndpointModels(resolvedProvider, resolvedBaseUrl, resolvedApiKey);
    return { models, endpoint };
}

/**
 * Dialects lie: an OpenAI-shaped router behind an "ollama" pick, a base
 * URL that already ends in /v1, a minimal server with one listing route.
 * Probe the candidate paths in order and accept either listing shape, so
 * model pickers fill instead of dead-ending on the first 404.
 */
async function probeEndpointModels(provider, baseUrl, apiKey) {
    const attempts = [];
    for (const url of listingCandidates(provider, baseUrl)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await egressFetch(url, {
                method: 'GET',
                headers: wireHeaders(provider, apiKey || undefined),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!response.ok) {
                attempts.push(`${url}: ${response.status}`);
                continue;
            }
            const payload = await response.json().catch(() => null);
            // Gateways that answer errors with HTTP 200 envelopes (Z.AI's
            // {success:false, code, msg}) surface their own message — a
            // masked auth failure must not read as an empty listing.
            if (payload && payload.success === false && typeof payload.msg === 'string') {
                attempts.push(`${url}: ${payload.msg}`);
                continue;
            }
            const models = endpointModelIds(payload);
            if (models.length) return { models, endpoint: url };
            attempts.push(`${url}: empty`);
        } catch (error) {
            clearTimeout(timeout);
            attempts.push(`${url}: unreachable (${error?.cause?.code || error?.name || 'unknown'})`);
        }
    }
    throw createError({
        statusCode: 502,
        message: `No model listing found (tried ${attempts.join('; ')})`
    });
}

const CHAT_MODELS_TTL_MS = 60_000;
const chatModelsCache = new Map();

/**
 * The models each chat profile's endpoint actually serves — the chat
 * execution point's picker rows (the profile owns the endpoint; the
 * conversation picks the model). Listed live with a short cache; a down
 * endpoint simply contributes no rows.
 */
export async function chatModels(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const profiles = setting?.profiles && typeof setting.profiles === 'object' ? setting.profiles : {};
    const rows = [];
    await Promise.all(Object.entries(profiles)
        .filter(([, profile]) => profile?.kind === 'chat')
        .map(async ([id, profile]) => {
            const config = profileWireConfig(profile);
            if (config.provider === 'none' || !config.baseUrl) return;
            const key = `${config.provider}::${config.baseUrl}::${config.apiKey ? 'keyed' : 'open'}`;
            const cached = chatModelsCache.get(key);
            let models;
            if (cached && Date.now() - cached.at < CHAT_MODELS_TTL_MS) {
                models = cached.models;
            } else {
                try {
                    models = (await probeEndpointModels(config.provider, config.baseUrl, config.apiKey)).models;
                } catch {
                    return;
                }
                chatModelsCache.set(key, { at: Date.now(), models });
            }
            for (const model of models) rows.push({ profile: String(id), model });
        }));
    return rows;
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

const THINK_OPEN_TAGS = ['\u003cthink\u003e', '\u003cthinking\u003e'];
const THINK_CLOSE_TAGS = ['\u003c/think\u003e', '\u003c/thinking\u003e'];

/**
 * Reasoning models that ride the chat wire inline are split here so the
 * neutral contract keeps reasoning and answer apart. Two shapes are
 * handled: explicit open/close tag pairs anywhere in the content, and the
 * Ollama-compatible OpenAI shape where qwen3's chat template prefills the
 * open tag, so the content simply *starts* in reasoning and ends at the
 * close tag (`reasoningFirst`). `push` takes an arbitrary fragment and
 * returns the resolved deltas, holding back a partial delimiter that
 * straddles fragments; `flush` drains the tail at stream end.
 */
function createThinkingSplitter({ reasoningFirst = false } = {}) {
    let inThinking = reasoningFirst;
    let sawTag = false;
    let held = '';
    const tags = () => (
        inThinking
            ? (reasoningFirst ? [...THINK_CLOSE_TAGS, ...THINK_OPEN_TAGS] : THINK_CLOSE_TAGS)
            : THINK_OPEN_TAGS
    );
    // Earliest match wins; at the same index the longer tag wins so no
    // suffix of it leaks into the text.
    const find = () => {
        let best = null;
        for (const tag of tags()) {
            const index = held.indexOf(tag);
            if (index < 0) continue;
            if (!best || index < best.index || (index === best.index && tag.length > best.tag.length)) best = { index, tag };
        }
        return best;
    };
    return {
        push(fragment) {
            held += fragment;
            const events = [];
            for (;;) {
                const match = find();
                if (match) {
                    if (match.index) events.push({ type: inThinking ? 'thinking' : 'text', text: held.slice(0, match.index) });
                    held = held.slice(match.index + match.tag.length);
                    // In reasoning-first mode an open tag while already
                    // thinking is the prefill made explicit: consume it
                    // without leaving the mode.
                    if (!(inThinking && THINK_OPEN_TAGS.includes(match.tag))) inThinking = !inThinking;
                    sawTag = true;
                    continue;
                }
                let hold = 0;
                for (const tag of tags()) {
                    for (let length = Math.min(held.length, tag.length - 1); length > hold; length--) {
                        if (held.endsWith(tag.slice(0, length))) { hold = length; break; }
                    }
                }
                const text = held.slice(0, held.length - hold);
                if (text) events.push({ type: inThinking ? 'thinking' : 'text', text });
                held = held.slice(held.length - hold);
                return events;
            }
        },
        flush() {
            const events = held ? [{ type: inThinking ? 'thinking' : 'text', text: held }] : [];
            held = '';
            return events;
        },
        // A reasoning-first stream that never met a tag carried a plain
        // answer all along (a no-think model behind the same endpoint):
        // the reader moves the accumulated reasoning into the answer.
        get reclassify() { return reasoningFirst && !sawTag; }
    };
}

/** Splits a whole completion body into its reasoning and answer halves. */
function splitThinking(content, { reasoningFirst = false } = {}) {
    const splitter = createThinkingSplitter({ reasoningFirst });
    let thinking = '';
    let answer = '';
    for (const event of [...splitter.push(content || ''), ...splitter.flush()]) {
        if (event.type === 'thinking') thinking += event.text;
        else answer += event.text;
    }
    if (splitter.reclassify && thinking) return { content: thinking, thinking: '' };
    return { content: answer, thinking };
}

function neutralMessage({ content = '', reasoning = '', toolCalls = [], reasoningFirst = false }) {
    const split = splitThinking(content, { reasoningFirst });
    return {
        content: split.content,
        thinking: reasoning ? `${reasoning}${split.thinking}` : split.thinking,
        toolCalls
    };
}

// Ollama-compatible OpenAI shapes run qwen3-class reasoning models with
// the open think tag prefilled by the chat template: content starts in
// reasoning and ends at the close tag. Answer-first models behind the
// same dialect keep live text deltas; the end-of-stream reconcile in the
// agent runtime still corrects a mislabel.
const REASONING_FIRST_MODEL = /(?:^|[^a-z0-9])(qwen3|qwq|deepseek-r1)(?![a-z0-9])/i;
const reasoningFirstContent = (config) => (
    config?.provider === 'openai' && REASONING_FIRST_MODEL.test(String(config?.model || ''))
);

function wireResponseToNeutral(config, payload) {
    const provider = config.provider;
    const reasoningFirst = reasoningFirstContent(config);
    if (provider === 'ollama') {
        const message = payload?.message || {};
        return neutralMessage({
            content: typeof message.content === 'string' ? message.content : '',
            reasoning: typeof message.thinking === 'string' ? message.thinking : '',
            toolCalls: (message.tool_calls || []).map((call, index) => ({
                id: call.id || `ollama-${index}`,
                name: call.function?.name || '',
                arguments: parseJsonObject(call.function?.arguments)
            }))
        });
    }
    if (provider === 'anthropic') {
        const blocks = Array.isArray(payload?.content) ? payload.content : [];
        return neutralMessage({
            content: blocks
                .filter((block) => block.type === 'text' && typeof block.text === 'string')
                .map((block) => block.text)
                .join(''),
            reasoning: blocks
                .filter((block) => block.type === 'thinking' && typeof block.thinking === 'string')
                .map((block) => block.thinking)
                .join(''),
            toolCalls: blocks
                .filter((block) => block.type === 'tool_use')
                .map((block) => ({ id: block.id, name: block.name, arguments: block.input ?? {} }))
        });
    }
    const message = payload?.choices?.[0]?.message;
    return neutralMessage({
        content: typeof message?.content === 'string' ? message.content : '',
        reasoning: typeof message?.reasoning_content === 'string' ? message.reasoning_content : '',
        reasoningFirst,
        toolCalls: (message?.tool_calls || []).map((call) => ({
            id: call.id,
            name: call.function?.name || '',
            arguments: parseJsonObject(call.function?.arguments)
        }))
    });
}

function wireRequest(provider, config, system, messages, tools, { stream = false } = {}) {
    const wireTools = neutralToolsToWire(provider, tools);
    if (provider === 'anthropic') {
        return {
            model: config.model,
            max_tokens: 4096,
            ...(system ? { system } : {}),
            messages: neutralMessagesToWire(provider, system, messages),
            ...(wireTools ? { tools: wireTools } : {}),
            ...(stream ? { stream: true } : {})
        };
    }
    const body = {
        model: config.model,
        messages: neutralMessagesToWire(provider, system, messages),
        ...(wireTools ? { tools: wireTools } : {})
    };
    // Ollama's native protocol requires an explicit flag either way; the
    // OpenAI-shaped protocol streams only when asked.
    if (provider === 'ollama') body.stream = stream;
    else if (stream) body.stream = true;
    return body;
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

/**
 * Completion paths, canonicalized: the OpenAI dialect conventionally
 * mounts under `/v1` (routers reject the root path with no_route), so a
 * base that already carries `/v1` is stripped and the prefix always
 * applied; same for the Messages dialect. Ollama's native path is
 * unambiguous. The second candidate covers root-mounted servers —
 * same dialect only, never a wire-shape guess.
 */
function completionPaths(provider, baseUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const root = base.replace(/\/v1$/, '');
    if (provider === 'ollama') return [`${base}/api/chat`];
    if (provider === 'anthropic') return [`${root}/v1/messages`, `${root}/messages`];
    return [`${root}/v1/chat/completions`, `${root}/chat/completions`];
}

// Resolved fast paths per (provider, root) — a first-request 404 on the
// canonical candidate caches the winner so later rounds pay nothing.
const resolvedCompletionPaths = new Map();

/**
 * One HTTP request against the completion path, with the same-dialect
 * fallback candidate and the idle guard. Returns `{ response, keepAlive,
 * release }`: `keepAlive` re-arms the idle timer (streaming callers call it
 * per chunk so a long generation is never killed mid-flight while bytes
 * keep arriving), `release` drops it.
 */
async function openCompletion(config, requestBodyJson, signal = null) {
    const paths = completionPaths(config.provider, config.baseUrl);
    const cacheKey = `${config.provider}::${String(config.baseUrl || '').replace(/\/+$/, '').replace(/\/v1$/, '')}`;
    const ordered = resolvedCompletionPaths.has(cacheKey)
        ? [resolvedCompletionPaths.get(cacheKey)]
        : paths;
    let lastStatus = 0;
    let lastDetail = '';
    for (const url of ordered) {
        const controller = new AbortController();
        // Caller cancellation rides the same controller as the idle guard;
        // an aborted caller is not an unreachable endpoint and must not
        // fall through to the next candidate.
        const abortFromCaller = () => controller.abort();
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', abortFromCaller, { once: true });
        }
        let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const keepAlive = () => {
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        };
        const release = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abortFromCaller);
        };
        let response;
        try {
            response = await egressFetch(url, {
                method: 'POST',
                headers: wireHeaders(config.provider, config.apiKey),
                body: requestBodyJson,
                signal: controller.signal
            });
        } catch (error) {
            release();
            if (signal?.aborted) throw error;
            throw createError({ statusCode: 502, message: `LLM service is unreachable (${error?.cause?.code || error?.name || error?.message || 'unknown'})` });
        }
        if (response.ok) {
            if (ordered.length > 1) resolvedCompletionPaths.set(cacheKey, url);
            return { response, keepAlive, release };
        }
        release();
        lastStatus = response.status;
        lastDetail = (await response.text().catch(() => '')).trim().slice(0, 200);
        // Only a missing route justifies the next same-dialect candidate;
        // auth, validation, and model errors belong to the caller.
        if (![404, 405, 501].includes(response.status)) break;
    }
    throw createError({
        statusCode: 502,
        message: lastDetail
            ? `LLM service error (${lastStatus}): ${lastDetail}`
            : `LLM service error (${lastStatus})`
    });
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
export async function chatCompletion({ organizationId = null, capability = CHAT_CAPABILITY, profileId = '', model = '', system = '', messages = [], tools = [] }) {
    const config = await resolveLlmConfig(organizationId, capability, { profileId, model });
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'LLM provider is not configured' });
    }
    const { response, release } = await openCompletion(config, JSON.stringify(wireRequest(config.provider, config, system, messages, tools)));
    try {
        const payload = await response.json().catch(() => null);
        if (!payload) throw createError({ statusCode: 502, message: 'LLM service returned no completion' });
        return wireResponseToNeutral(config, payload);
    } finally {
        release();
    }
}

// --- Streaming ------------------------------------------------------------

/**
 * Yields decoded lines from a streaming response body, re-arming the idle
 * guard per chunk, so a stalled endpoint aborts exactly like a dead
 * connection instead of hanging the worker forever.
 */
async function* readLines(response, keepAlive) {
    const body = response.body;
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            let step;
            try {
                step = await reader.read();
            } catch (error) {
                throw createError({ statusCode: 502, message: `LLM stream interrupted (${error?.name || error?.message || 'unknown'})` });
            }
            if (step.done) break;
            keepAlive();
            buffer += decoder.decode(step.value, { stream: true });
            let index;
            while ((index = buffer.indexOf('\n')) >= 0) {
                yield buffer.slice(0, index).replace(/\r$/, '');
                buffer = buffer.slice(index + 1);
            }
        }
        if (buffer.trim()) yield buffer.replace(/\r$/, '');
    } finally {
        reader.releaseLock?.();
    }
}

/** SSE payload of one `data:` line, or null for comments/blanks/`[DONE]`. */
function sseData(line) {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    return !data || data === '[DONE]' ? null : data;
}

/**
 * Per-stream reasoning/answer accumulator over the inline-tag splitter:
 * `feed` routes a content fragment through it, `note` records
 * provider-supplied reasoning, `end` drains the tail. Each returns the
 * deltas to yield.
 */
function streamAccumulator({ reasoningFirst = false } = {}) {
    const splitter = createThinkingSplitter({ reasoningFirst });
    const totals = { content: '', thinking: '' };
    const collect = (events) => {
        for (const event of events) totals[event.type === 'thinking' ? 'thinking' : 'content'] += event.text;
        return events;
    };
    return {
        totals,
        feed: (fragment) => collect(splitter.push(fragment)),
        note: (text) => {
            totals.thinking += text;
            return [{ type: 'thinking', text }];
        },
        end: () => {
            const events = collect(splitter.flush());
            if (splitter.reclassify && totals.thinking) {
                totals.content = totals.thinking + totals.content;
                totals.thinking = '';
            }
            return events;
        }
    };
}

/**
 * Provider stream readers: each yields `{ type: 'thinking' | 'text', text }`
 * deltas and returns the assembled neutral message. Tool calls arrive as
 * fragments (OpenAI/Messages split `arguments` across events, Ollama sends
 * them whole), so every reader accumulates before parsing.
 */
async function* streamOpenAI(response, keepAlive, options = {}) {
    const acc = streamAccumulator(options);
    const calls = [];
    for await (const line of readLines(response, keepAlive)) {
        const data = sseData(line);
        if (!data) continue;
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        const delta = chunk?.choices?.[0]?.delta;
        if (!delta) continue;
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === 'string' && reasoning) yield* acc.note(reasoning);
        if (typeof delta.content === 'string' && delta.content) yield* acc.feed(delta.content);
        for (const call of delta.tool_calls || []) {
            const index = call.index ?? calls.length;
            const slot = calls[index] || (calls[index] = { id: '', name: '', args: '' });
            if (call.id) slot.id = call.id;
            if (call.function?.name) slot.name += call.function.name;
            if (call.function?.arguments) slot.args += call.function.arguments;
        }
    }
    yield* acc.end();
    return {
        content: acc.totals.content,
        thinking: acc.totals.thinking,
        toolCalls: calls.filter(Boolean).map(call => ({
            id: call.id, name: call.name, arguments: parseJsonObject(call.args)
        }))
    };
}

async function* streamOllama(response, keepAlive, options = {}) {
    const acc = streamAccumulator(options);
    const toolCalls = [];
    for await (const line of readLines(response, keepAlive)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk;
        try { chunk = JSON.parse(trimmed); } catch { continue; }
        const message = chunk?.message || {};
        if (typeof message.thinking === 'string' && message.thinking) yield* acc.note(message.thinking);
        if (typeof message.content === 'string' && message.content) yield* acc.feed(message.content);
        for (const [index, call] of (message.tool_calls || []).entries()) {
            toolCalls.push({
                id: call.id || `ollama-${index}`,
                name: call.function?.name || '',
                arguments: parseJsonObject(call.function?.arguments)
            });
        }
    }
    yield* acc.end();
    return { content: acc.totals.content, thinking: acc.totals.thinking, toolCalls };
}

async function* streamAnthropic(response, keepAlive, options = {}) {
    const acc = streamAccumulator(options);
    const toolCalls = [];
    let openBlock = null;
    for await (const line of readLines(response, keepAlive)) {
        const data = sseData(line);
        if (!data) continue;
        let event;
        try { event = JSON.parse(data); } catch { continue; }
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            openBlock = { id: event.content_block.id, name: event.content_block.name, args: '' };
        } else if (event.type === 'content_block_delta') {
            const delta = event.delta || {};
            if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                yield* acc.note(delta.thinking);
            } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
                yield* acc.feed(delta.text);
            } else if (delta.type === 'input_json_delta' && openBlock) {
                openBlock.args += delta.partial_json || '';
            }
        } else if (event.type === 'content_block_stop' && openBlock) {
            toolCalls.push({ id: openBlock.id, name: openBlock.name, arguments: parseJsonObject(openBlock.args) });
            openBlock = null;
        }
    }
    yield* acc.end();
    return { content: acc.totals.content, thinking: acc.totals.thinking, toolCalls };
}

/**
 * Streaming twin of `chatCompletion` on the same neutral contract: an async
 * generator that yields `{ type: 'thinking' | 'text', text }` deltas as the
 * model emits them and closes with one `{ type: 'message', content,
 * thinking, toolCalls }` — the fully assembled neutral assistant message.
 * Throws 503/502 exactly like the non-streaming path. Consumers that cannot
 * render partial output use `chatCompletion`; the agent loop streams only
 * what it will keep.
 */
export async function* streamChatCompletion({ organizationId = null, capability = CHAT_CAPABILITY, profileId = '', model = '', system = '', messages = [], tools = [], signal = null }) {
    const config = await resolveLlmConfig(organizationId, capability, { profileId, model });
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'LLM provider is not configured' });
    }
    const { response, keepAlive, release } = await openCompletion(
        config,
        JSON.stringify(wireRequest(config.provider, config, system, messages, tools, { stream: true })),
        signal
    );
    const reader = config.provider === 'ollama' ? streamOllama(response, keepAlive)
        : config.provider === 'anthropic' ? streamAnthropic(response, keepAlive)
            : streamOpenAI(response, keepAlive, { reasoningFirst: reasoningFirstContent(config) });
    try {
        const iterator = reader[Symbol.asyncIterator]();
        let step = await iterator.next();
        while (!step.done) {
            yield step.value;
            step = await iterator.next();
        }
        const message = step.value || { content: '', thinking: '', toolCalls: [] };
        if (!message.content && !message.toolCalls.length) {
            throw createError({ statusCode: 502, message: 'LLM service returned no completion' });
        }
        yield { type: 'message', content: message.content, thinking: message.thinking || '', toolCalls: message.toolCalls };
    } finally {
        release();
    }
}
