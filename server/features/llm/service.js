import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';

const PROVIDERS = new Set(['openai']);
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 120000;

function providerEnvConfig() {
    return {
        baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).trim(),
        apiKey: (process.env.LLM_API_KEY || '').trim()
    };
}

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

/**
 * Provider resolution merges the organization's `data.settings.llm` over the
 * environment defaults (see the llm README for the table). A selected
 * provider that cannot work — `openai` without an API key — resolves to
 * `{ provider: 'none' }` so consumers treat the LLM as unavailable instead
 * of failing per request.
 */
export async function resolveLlmConfig(organizationId = null) {
    const setting = await orgLlmSetting(organizationId);
    const requested = String(setting?.provider ?? process.env.LLM_PROVIDER ?? 'none').trim();
    const provider = PROVIDERS.has(requested) ? requested : 'none';
    if (provider === 'none') return { provider: 'none' };
    const env = providerEnvConfig();
    const baseUrl = String(setting?.baseUrl || '').trim() || env.baseUrl;
    const apiKey = String(setting?.apiKey || '').trim() || env.apiKey;
    const model = String(setting?.model || '').trim()
        || String(process.env.LLM_MODEL || '').trim()
        || DEFAULT_MODEL;
    if (!baseUrl || !apiKey) return { provider: 'none' };
    return { provider, baseUrl, apiKey, model };
}

export async function isLlmAvailable(organizationId = null) {
    return (await resolveLlmConfig(organizationId)).provider !== 'none';
}

/**
 * One OpenAI-compatible chat-completion round: `messages` follows the
 * chat-completions role/content shape (assistant entries may carry
 * `tool_calls`, tool entries carry `tool_call_id`); `tools` is the
 * function-tool descriptor list. Returns the assistant message (content
 * string and/or `tool_calls`) — the agent loop that owns rounds and tool
 * execution lives with its consumer.
 */
export async function chatCompletion({ organizationId = null, messages = [], tools = null }) {
    const config = await resolveLlmConfig(organizationId);
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'LLM provider is not configured' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                ...(tools?.length ? { tools, tool_choice: 'auto' } : {})
            }),
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
    const message = payload?.choices?.[0]?.message;
    if (!message) {
        throw createError({ statusCode: 502, message: 'LLM service returned no completion' });
    }
    return message;
}
