import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';

const PROVIDERS = new Set(['local', 'cloud']);
const CLOUD_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'whisper-1';
const REQUEST_TIMEOUT_MS = 300000;

function providerEnvConfig(provider) {
    if (provider === 'local') {
        return {
            baseUrl: (process.env.TRANSCRIPTION_LOCAL_BASE_URL || '').trim(),
            apiKey: (process.env.TRANSCRIPTION_LOCAL_API_KEY || '').trim()
        };
    }
    return {
        baseUrl: (process.env.TRANSCRIPTION_CLOUD_BASE_URL || CLOUD_DEFAULT_BASE_URL).trim(),
        apiKey: (process.env.TRANSCRIPTION_CLOUD_API_KEY || '').trim()
    };
}

async function orgTranscriptionSetting(organizationId) {
    const id = organizationId?.toString?.().trim?.() || '';
    if (!id) return null;
    try {
        const org = await organizationsService.getById(id);
        const setting = org?.data?.settings?.transcription;
        return setting && typeof setting === 'object' ? setting : null;
    } catch {
        return null;
    }
}

/**
 * Provider resolution merges the organization's `data.settings.transcription`
 * over the environment defaults (see the transcription README for the table).
 * A selected provider that cannot work — `local` without a base URL, `cloud`
 * without an API key — resolves to `{ provider: 'none' }` so consumers treat
 * transcription as unavailable instead of failing per request.
 */
export async function resolveTranscriptionConfig(organizationId = null) {
    const setting = await orgTranscriptionSetting(organizationId);
    const requested = String(setting?.provider ?? process.env.TRANSCRIPTION_PROVIDER ?? 'none').trim();
    const provider = PROVIDERS.has(requested) ? requested : 'none';
    if (provider === 'none') return { provider: 'none' };
    const env = providerEnvConfig(provider);
    const baseUrl = String(setting?.baseUrl || '').trim() || env.baseUrl;
    const apiKey = String(setting?.apiKey || '').trim() || env.apiKey;
    const language = String(setting?.language || '').trim() || String(process.env.TRANSCRIPTION_LANGUAGE || '').trim();
    const model = String(setting?.model || '').trim()
        || String(process.env.TRANSCRIPTION_MODEL || '').trim()
        || DEFAULT_MODEL;
    if (!baseUrl || (provider === 'cloud' && !apiKey)) return { provider: 'none' };
    return { provider, baseUrl, apiKey, model, language };
}

export async function isTranscriptionAvailable(organizationId = null) {
    return (await resolveTranscriptionConfig(organizationId)).provider !== 'none';
}

/**
 * Provider wire contracts (see the transcription README): `local` posts the
 * audio to `{baseUrl}/transcribe` with an optional `language` hint and joins
 * the returned segment texts into the transcript; `cloud` posts the
 * OpenAI-compatible `{baseUrl}/audio/transcriptions` with `model` and reads
 * `{ text }`. Empty results mean no speech was detected; callers decide what
 * that means.
 */
export async function transcribeAudio({ buffer, filename, mimeType, organizationId = null }) {
    const config = await resolveTranscriptionConfig(organizationId);
    if (config.provider === 'none') {
        throw createError({ statusCode: 503, message: 'Transcription is not configured' });
    }
    const local = config.provider === 'local';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);
    if (local) {
        if (config.language) form.append('language', config.language);
    } else {
        form.append('model', config.model);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${config.baseUrl}${local ? '/transcribe' : '/audio/transcriptions'}`, {
            method: 'POST',
            headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
            body: form,
            signal: controller.signal
        });
    } catch (error) {
        throw createError({ statusCode: 502, message: 'Transcription service is unreachable' });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw createError({
            statusCode: 502,
            message: detail ? `Transcription service error: ${detail}` : 'Transcription service error'
        });
    }
    const payload = await response.json().catch(() => null);
    const text = local ? localTranscriptText(payload) : transcriptText(payload);
    return { text, provider: config.provider, model: local ? '' : config.model };
}

function transcriptText(payload) {
    return typeof payload?.text === 'string' ? payload.text.trim() : '';
}

function localTranscriptText(payload) {
    if (!Array.isArray(payload?.segments)) return '';
    return payload.segments
        .map(segment => (typeof segment?.text === 'string' ? segment.text.trim() : ''))
        .filter(Boolean)
        .join(' ');
}
