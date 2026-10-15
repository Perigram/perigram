import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';

/**
 * LLM is a capability module over a selectable provider table (owner
 * direction 2026-10-15: local models with options to choose). Consumers
 * speak ONE neutral conversation contract — system string, user/assistant/
 * tool messages with structured tool calls, object-valued arguments — and
 * this module owns the per-provider wire translation:
 *
 * | Provider   | Endpoint                | Wire shape |
 * |---|---|---|
 * | `ollama`   | `{baseUrl}/api/chat`    | Native Ollama: function tools, object arguments, `message` response |
 * | `anthropic`| `{baseUrl}/v1/messages` | Messages protocol: system field, content blocks, `tool_use`/`tool_result` |
 * | `openai`   | `{baseUrl}/chat/completions` | Chat-completions shape for local OpenAI-shaped servers (vLLM-style); no cloud default |
 *
 * There is no default base URL: a provider is usable only when both
 * `baseUrl` and `model` resolve (org setting over env), and an unusable
 * provider resolves to `{ provider: 'none' }` so consumers treat the LLM
 * as unavailable instead of failing per request — the same posture as
 * [transcription](../transcription/README.md).
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

export async function resolveLlmConfig(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const requested = String(setting?.provider ?? process.env.LLM_PROVIDER ?? 'none').trim();
    const provider = PROVIDERS.has(requested) ? requested : 'none';
    if (provider === 'none') return { provider: 'none' };
    const baseUrl = String(setting?.baseUrl || '').trim() || String(process.env.LLM_BASE_URL || '').trim();
    const apiKey = String(setting?.apiKey || '').trim() || String(process.env.LLM_API_KEY || '').trim();
    const model = String(setting?.model || '').trim() || String(process.env.LLM_MODEL || '').trim();
    if (!baseUrl || !model) return { provider: 'none' };
    return { provider, baseUrl, apiKey, model };
}

export async function isLlmAvailable(organizationId = null) {
    return (await resolveLlmConfig(organizationId)).provider !== 'none';
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
export async function chatCompletion({ organizationId = null, system = '', messages = [], tools = [] }) {
    const config = await resolveLlmConfig(organizationId);
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
