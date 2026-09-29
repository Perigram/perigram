import { createError } from 'h3';
import * as organizationsService from '~/server/features/organizations/service.js';
import * as usersService from '~/server/features/users/service.js';
import * as filesService from '~/server/features/files/service.js';
import * as transcriptionService from '~/server/features/transcription/service.js';
import { insertRecordingMessage, findChatGroup } from '../support/service.js';

const REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_PROTOCOL = [
    'You summarize recorded calls for the team.',
    'Write a compact summary in the call\'s language:',
    'decisions made, action items with owners, open questions.',
    'Plain text, no headings longer than one line.'
].join(' ');

/**
 * Config resolution mirrors the transcription feature: the org's
 * `data.settings.meetings` overrides environment defaults, and a missing
 * chat endpoint disables summaries entirely (see the meetings README).
 */
export async function resolveMeetingsConfig(organizationId = null) {
    const setting = await orgMeetingsSetting(organizationId);
    const baseUrl = String(setting?.baseUrl || '').trim()
        || String(process.env.MEETINGS_LLM_BASE_URL || '').trim();
    const model = String(setting?.model || '').trim()
        || String(process.env.MEETINGS_LLM_MODEL || '').trim();
    if (!setting?.enabled && !baseUrl) return { enabled: false };
    if (!baseUrl) return { enabled: false };
    const protocol = await protocolText(setting?.protocolFileId);
    return {
        enabled: true,
        protocol,
        botUserId: String(setting?.botUserId || '').trim(),
        baseUrl,
        model,
        apiKey: String(setting?.apiKey || '').trim() || String(process.env.MEETINGS_LLM_API_KEY || '').trim()
    };
}

async function orgMeetingsSetting(organizationId) {
    const id = organizationId?.toString?.().trim?.() || '';
    if (!id) return null;
    try {
        const org = await organizationsService.getById(id);
        const setting = org?.data?.settings?.meetings;
        return setting && typeof setting === 'object' ? setting : null;
    } catch {
        return null;
    }
}

async function protocolText(protocolFileId) {
    const id = String(protocolFileId || '').trim();
    if (!id) return DEFAULT_PROTOCOL;
    try {
        const buffer = await filesService.getFileBuffer(id);
        const text = buffer.toString('utf8').trim();
        return text || DEFAULT_PROTOCOL;
    } catch {
        return DEFAULT_PROTOCOL;
    }
}

async function organizationForRecording(record) {
    if (record.conversationKey?.startsWith('group:')) {
        try {
            const group = await findChatGroup(record.conversationKey.slice('group:'.length));
            const orgId = group?.lineage?.organizationId;
            if (orgId) return orgId?.toString?.() || orgId;
        } catch { /* fall through to the starter */ }
    }
    try {
        const user = await usersService.getById(record.startedByUserId);
        const membership = (user?.data?.memberships || []).find(Boolean);
        const orgId = membership?.organizationId;
        return orgId?.toString?.() || orgId || null;
    } catch {
        return null;
    }
}

/**
 * Best-effort recording summary (see the meetings README): transcribe the
 * imported recording, summarize through the org's chat model under its
 * protocol, and post the summary as the bot (or the recording starter).
 * Never throws — the recording message already landed.
 */
export async function summarizeRecording({ record = {}, message = {} } = {}) {
    try {
        const organizationId = await organizationForRecording(record);
        const config = await resolveMeetingsConfig(organizationId);
        if (!config.enabled) return null;
        const attachment = message.attachment || {};
        if (!attachment.fileId) return null;
        const buffer = await filesService.getFileBuffer(attachment.fileId);
        const { text: transcript } = await transcriptionService.transcribeAudio({
            buffer,
            filename: `call-recording-${record.egressId}.mp4`,
            mimeType: 'video/mp4',
            organizationId
        });
        if (!transcript) {
            console.log(`Meeting summary skipped: no speech in recording ${record.egressId}`);
            return null;
        }
        const summary = await chatCompletion(config, transcript);
        if (!summary) return null;
        return await insertRecordingMessage({
            conversationKey: record.conversationKey,
            senderUserId: config.botUserId || record.startedByUserId,
            message: summary
        });
    } catch (error) {
        console.error(`Meeting summary failed for ${record.egressId}:`, error);
        return null;
    }
}

async function chatCompletion(config, transcript) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
            },
            body: JSON.stringify({
                model: config.model,
                stream: false,
                messages: [
                    { role: 'system', content: config.protocol },
                    { role: 'user', content: transcript }
                ]
            }),
            signal: controller.signal
        });
    } catch (error) {
        throw createError({ statusCode: 502, message: 'Meeting model is unreachable' });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw createError({
            statusCode: 502,
            message: detail ? `Meeting model error: ${detail}` : 'Meeting model error'
        });
    }
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
}
