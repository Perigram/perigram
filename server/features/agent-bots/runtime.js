import * as llmService from '~/server/features/llm/service.js';
import * as supportService from '~/server/features/support/service.js';
import { MESSAGE_SENDER } from '~/server/features/support/const.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { buildBotAuth, isBotUser } from './service.js';
import * as botRepository from './repository.js';
import { executeTool, chatToolDescriptors } from './tools.js';

/**
 * The chat bot runtime: registered (by the agent-bots nitro plugin) as a
 * support message observer, it decides which bots answer a persisted
 * message and drives their tool-calling loop. Replies re-enter the
 * auth-checked support send path as the bot user — the runtime holds no
 * separate delivery channel. The wake scanner drives the same loop from
 * status transitions (see wake-scanner.js).
 */

const HISTORY_LIMIT = 30;
const MAX_TOOL_ROUNDS = 8;

// One in-flight reply per bot and conversation: bursts (or a subscriber's
// own sends racing the reply) must not stack duplicate answers. Chat
// replies and lifecycle wakes share the lock space.
const inFlight = new Set();

const botFlagCache = new Map();
const BOT_FLAG_TTL_MS = 60_000;

async function senderIsBot(userId) {
    const key = String(userId || '');
    if (!key) return false;
    const cached = botFlagCache.get(key);
    if (cached && Date.now() - cached.at < BOT_FLAG_TTL_MS) return cached.isBot;
    const isBot = await isBotUser(key);
    botFlagCache.set(key, { at: Date.now(), isBot });
    return isBot;
}

/**
 * Conversation keys a message belongs to: its own thread plus, for instance
 * messages, every ancestor along the stored instance path — a bot
 * subscribed to a composed ancestor view answers messages landing on any
 * descendant instance chat.
 */
function candidateConversationKeys(context, message) {
    const keys = new Set([String(message.conversationKey || context.conversationKey || '')].filter(Boolean));
    for (const entry of message.instancePath || []) {
        if (entry?.type && entry?.id) keys.add(supportService.instanceConversationKey(entry.type, entry.id));
    }
    return [...keys];
}

/**
 * Trigger rules: support-channel messages never trigger; bot senders never
 * trigger (no bot-to-bot loops); direct conversations answer implicitly
 * when exactly one participant is a bot; group and instance conversations
 * answer through subscriptions.
 */
export async function resolveTargetBots(context, message) {
    if (!message || context.kind === 'support') return [];
    if (message.sender && message.sender !== MESSAGE_SENDER.USER) return [];
    if (await senderIsBot(message.senderUserId)) return [];

    if (context.kind === 'direct') {
        const participants = (message.participants || context.participants || []).map(item => String(item));
        const bots = [];
        for (const participant of participants) {
            if (await senderIsBot(participant)) bots.push(participant);
        }
        return bots.length === 1 ? bots : [];
    }

    const subscriptions = await botRepository.findSubscriptionsByConversation(candidateConversationKeys(context, message));
    return [...new Set(subscriptions.map(row => String(row.botUserId)))];
}

function systemPrompt(botName, organizationName) {
    return [
        `You are ${botName}, an agent operating inside Perigram — a process programming platform — for the organization "${organizationName}".`,
        'You manipulate process definitions and instances through the provided tools, which enforce the same access rules as every other client.',
        'Authoring discipline: read before writing (get_process_definition / list_types / list_instances), always validate_process_definition before activate_process_definition, and treat activation gates (migration plans, type death) as confirmations to surface and resolve — never to bypass.',
        'Answer the conversation directly when no tool is needed. Keep replies short and concrete.'
    ].join(' ');
}

function historyMessages(messages = [], botUserId) {
    return messages
        .filter(item => item && typeof item.message === 'string' && item.message.trim())
        .map(item => ({
            role: String(item.senderUserId) === String(botUserId) ? 'assistant' : 'user',
            content: item.message.trim()
        }));
}

/**
 * The shared bounded tool-calling loop: neutral conversation in, final
 * assistant text out (null when the model produced nothing). Tool failures
 * become tool-result errors the model can read and adjust around.
 */
async function runAgentLoop({ botAuth, system, conversation }) {
    const organizationId = botAuth.organizationId;
    const profileId = botAuth.botProfile || '';
    const tools = chatToolDescriptors();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const assistant = await llmService.chatCompletion({ organizationId, profileId, system, messages: conversation, tools });
        const toolCalls = assistant.toolCalls || [];
        if (!toolCalls.length) {
            return (assistant.content || '').trim() || null;
        }
        conversation.push({ role: 'assistant', content: assistant.content || '', toolCalls });
        for (const call of toolCalls) {
            let result;
            try {
                result = await executeTool(call.name, call.arguments, botAuth);
            } catch (error) {
                result = { error: error?.message || String(error) };
            }
            conversation.push({
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: JSON.stringify(result)
            });
        }
    }
    return 'Stopped: tool round budget reached without a final answer.';
}

function replyBodyFor(context, message, text, botUserId) {
    if (context.kind === 'direct') {
        const other = (message.participants || context.participants || [])
            .map(item => String(item))
            .find(item => item !== String(botUserId));
        return { recipientUserId: other, message: text };
    }
    if (context.kind === 'group') {
        return { conversationKey: context.conversationKey, message: text };
    }
    const link = message.instanceLink || {};
    return { instance: { type: link.type, id: link.id }, message: text };
}

async function sendReply(botAuth, context, message, text) {
    await supportService.sendUserMessage(botAuth, replyBodyFor(context, message, text, botAuth.userId));
}

async function conversationHistory(conversationKey, botUserId) {
    const history = await supportService.listMessages({ conversationKey }, { limit: HISTORY_LIMIT });
    return historyMessages(history, botUserId);
}

/**
 * One bot's chat answer: bounded tool loop over the shared catalog, final
 * assistant text posted through the auth-checked send path. Loop-level
 * failures surface as a short reply so the room never stares at silence.
 */
export async function runBotReply(botUserId, context, message) {
    const lockKey = `${botUserId}:${message.conversationKey}`;
    if (inFlight.has(lockKey)) return;
    inFlight.add(lockKey);
    try {
        const botAuth = await buildBotAuth(botUserId);
        const organizationId = botAuth.organizationId;
        if (!(await llmService.isLlmAvailable(organizationId, 'chat', { profileId: botAuth.botProfile }))) {
            await sendReply(botAuth, context, message, 'LLM provider is not configured for this organization.');
            return;
        }
        const text = await runAgentLoop({
            botAuth,
            system: systemPrompt(botAuth.name, botAuth.organizationData?.name || ''),
            conversation: await conversationHistory(message.conversationKey, botUserId)
        });
        if (text) await sendReply(botAuth, context, message, text);
    } catch (error) {
        console.error('[AGENT-BOTS] reply failed:', error);
        try {
            const botAuth = await buildBotAuth(botUserId);
            await sendReply(botAuth, context, message, 'The agent failed to answer; try again.');
        } catch (nested) {
            console.error('[AGENT-BOTS] failure notice failed:', nested);
        }
    } finally {
        inFlight.delete(lockKey);
    }
}

/**
 * The observer registered against the support service. Fire-and-forget:
 * message persistence never awaits an LLM.
 */
export function handleMessageInserted(context, message) {
    resolveTargetBots(context, message)
        .then(botIds => Promise.all(botIds.map(botId => runBotReply(botId, context, message))))
        .catch(error => console.error('[AGENT-BOTS] trigger failed:', error));
}

// --- Lifecycle wakes --------------------------------------------------------

/** Posting body for a subscription's own conversation, derived from its key. */
function postingBodyForKey(conversationKey, text) {
    if (conversationKey.startsWith('group:')) {
        return { conversationKey, message: text };
    }
    const parsed = supportService.parseInstanceKey(conversationKey);
    if (parsed) return { instance: { type: parsed.type, id: parsed.id }, message: text };
    return null;
}

function actorLabelOf(event) {
    const actor = event.actor || {};
    if (actor.principalType === 'SYSTEM' || actor.id === 'SYSTEM') return 'SYSTEM';
    return actor.label || actor.id || '';
}

/**
 * One lifecycle wake (SPEC: agent wakes): the transition event becomes a
 * trigger message — the target instance is resolved through the bot's own
 * access-checked read, so a bot only wakes on instances it may see — and
 * the loop's answer lands in the subscribed conversation. No provider or
 * a failing wake logs and stays silent: nobody is waiting in the room.
 */
export async function runBotWake(subscription, event) {
    const lockKey = `${subscription.botUserId}:${subscription.conversationKey}`;
    if (inFlight.has(lockKey)) {
        console.warn('[AGENT-BOTS] wake skipped, reply already in flight:', lockKey);
        return;
    }
    inFlight.add(lockKey);
    try {
        const botAuth = await buildBotAuth(subscription.botUserId);
        if (!(await llmService.isLlmAvailable(botAuth.organizationId, 'chat', { profileId: botAuth.botProfile }))) return;
        const service = getAppRegistry().getInstanceService(String(event.targetType || ''));
        const instance = await service?.processGetById?.(String(event.targetId || ''), botAuth).catch(() => null);
        // An unreadable or missing target skips the wake: this is the
        // org-isolation boundary (the bot may not see other tenants'
        // instances), not a degraded prompt.
        if (!instance) return;
        const instanceName = instance.name || instance.identity?.name || String(event.targetId || '');
        const trigger = [
            `Lifecycle wake: ${event.targetType} "${instanceName}" (${event.targetId})`,
            `moved ${event.fromStatePrimary || '∅'} → ${event.toStatePrimary}`,
            actorLabelOf(event) ? `by ${actorLabelOf(event)}.` : '.',
            'Do the work this room expects; inspect the instance with tools if you need more than this summary.'
        ].join(' ');
        const text = await runAgentLoop({
            botAuth,
            system: systemPrompt(botAuth.name, botAuth.organizationData?.name || ''),
            conversation: [
                ...await conversationHistory(subscription.conversationKey, subscription.botUserId),
                { role: 'user', content: trigger }
            ]
        });
        if (!text) return;
        const body = postingBodyForKey(subscription.conversationKey, text);
        if (body) await supportService.sendUserMessage(botAuth, body);
    } catch (error) {
        console.error('[AGENT-BOTS] wake failed:', error);
    } finally {
        inFlight.delete(lockKey);
    }
}
