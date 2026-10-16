import * as llmService from '~/server/features/llm/service.js';
import * as supportService from '~/server/features/support/service.js';
import * as connectionsService from '~/server/features/connections/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import { MESSAGE_SENDER } from '~/server/features/support/const.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { buildPrincipalAuth, ensureOrganizationAssistant, isBotUser } from './service.js';
import * as botRepository from './repository.js';
import { executeTool, chatToolDescriptors } from './tools.js';

/**
 * The organization AI's chat runtime: registered (by the agent-bots
 * nitro plugin) as a support message observer, it decides when the AI
 * answers a persisted message and drives its tool-calling loop. Delegation
 * is the access contract (SPEC: agent access): a run executes with the
 * triggering sender's rights while replies are attributed to the
 * assistant. The wake scanner drives the same loop from status
 * transitions, delegated to the wake rule's author (see wake-scanner.js).
 */

const HISTORY_LIMIT = 30;
const MAX_TOOL_ROUNDS = 8;

// One in-flight reply per conversation: bursts (or a subscriber's own
// sends racing the reply) must not stack duplicate answers. Chat replies
// and lifecycle wakes share the lock space. Each entry carries the
// run's cancellation handle so the room can stop it in flight.
const inFlight = new Map();

/**
 * Stops every in-flight run in one conversation, from either the room's
 * message or its wake. Aborting the run's controller unwinds the LLM
 * stream; the loop then keeps whatever answer it had produced. Org-scoped
 * when both sides know the organization.
 */
export function stopConversationRuns(organizationId, conversationKey) {
    let stopped = 0;
    for (const entry of inFlight.values()) {
        if (String(entry.conversationKey) !== String(conversationKey)) continue;
        if (entry.organizationId && organizationId && String(entry.organizationId) !== String(organizationId)) continue;
        entry.controller.abort();
        stopped += 1;
    }
    return stopped;
}

/**
 * Room presence for the AI's run as it is produced: the runtime owns no
 * delivery channel, so the run's activity rides the conversation topic.
 * `bot_activity` carries the run's chronology so far (per-round reasoning
 * segments interleaved with tool invocations, in the order they happened),
 * `bot_stream` the answer so far, and `bot_stream_end` clears the run
 * once the persisted message supersedes it.
 */
function botActivitySink(assistantAuth, conversationKey) {
    const topic = `conversation:${conversationKey}`;
    const base = { conversationKey, userId: assistantAuth.userId, name: assistantAuth.name || '' };
    return {
        // Absolute state, not deltas: each publish carries the whole
        // chronology so far, and each round reconciles with the assembled
        // message, so a reasoning-first stream that turns out to be a
        // plain answer can reclassify without the client accumulating
        // garbage.
        activity(steps) {
            connectionsService.publish(topic, { ...base, type: 'bot_activity', steps });
        },
        answer(text) {
            connectionsService.publish(topic, { ...base, type: 'bot_stream', text });
        },
        end() {
            connectionsService.publish(topic, { ...base, type: 'bot_stream_end' });
        }
    };
}

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
 * messages, every ancestor along the stored instance path — the AI
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
 * Trigger rules: support-channel messages never trigger; the AI never
 * triggers itself (no loops); direct conversations answer implicitly when
 * the assistant is a participant; group and instance conversations answer
 * through subscriptions. The sender's agent-chat capability is checked at
 * run time, not here — resolution stays purely structural.
 */
export async function resolveAssistantTarget(context, message) {
    if (!message || context.kind === 'support') return null;
    if (message.sender && message.sender !== MESSAGE_SENDER.USER) return null;
    if (await senderIsBot(message.senderUserId)) return null;

    if (context.kind === 'direct') {
        const participants = (message.participants || context.participants || []).map(item => String(item));
        const bots = [];
        for (const participant of participants) {
            if (await senderIsBot(participant)) bots.push(participant);
        }
        if (bots.length !== 1) return null;
        // Direct chats need no membership, but the conversation is still a
        // model execution point: a profile-only subscription row may pin
        // the room's model.
        const [row] = await botRepository.findSubscriptionsByConversation([
            String(message.conversationKey || context.conversationKey || '')
        ]);
        return { assistantId: bots[0], profile: String(row?.profile || ''), model: String(row?.model || '') };
    }

    const subscriptions = await botRepository.findSubscriptionsByConversation(candidateConversationKeys(context, message));
    if (!subscriptions.length) return null;
    // One AI, one room: the first row is the room's membership (the key
    // stays bot+conversation from the multi-bot era; only the assistant's
    // rows exist).
    const row = subscriptions[0];
    return { assistantId: String(row.botUserId), profile: String(row.profile || ''), model: String(row.model || '') };
}

function systemPrompt(assistantName, organizationName, principalName) {
    return [
        `You are ${assistantName}, the organization AI operating inside Perigram — a process programming platform — for the organization "${organizationName}".`,
        `You are acting for ${principalName}: every tool call runs with exactly their access rights — you can read and do what they may, and nothing beyond it.`,
        'You manipulate process definitions and instances through the provided tools, which enforce the same access rules as every other client.',
        'Act on the user\'s declared intent without asking permission first — do the work, then report what happened. Activation gates are the only confirmations. Tool errors are fix instructions, not dead ends: read the message, correct the input, and retry in the same run — never ask the user whether to retry.',
        'The authored process protocol is fixed: dataflowVersion 4. Never ask about versions.',
        'Authoring discipline: read before writing (get_authoring_vocabulary for the palette and node kinds, get_process_definition / list_types / list_instances for the current state), edit existing definitions with edit_process_definition gestures instead of whole-graph echo-backs, always validate_process_definition before activate_process_definition, and treat activation gates (migration plans, type death) as confirmations to surface and resolve — never to bypass.',
        'Attach instances you handled with attach_instances so the conversation shows them as reference chips.',
        'Report tools truthfully: claim an action only from a tool result returned in this same run — if you have not called the tool yet, call it instead of describing it; never invent ids, statuses, or completions. A creation, update, or execution claim without its tool result is a failure.',
        'Instance work runs through the action manifest: list_actions to see create/update/delete/link/unlink, then run_action with the action id. Never claim an ability is missing before listing the actions.',
        'Answer the conversation directly when no tool is needed. Keep replies short and concrete.'
    ].join(' ');
}

function historyMessages(messages = [], assistantUserId) {
    return messages
        .filter(item => item && typeof item.message === 'string' && item.message.trim())
        .map(item => ({
            role: String(item.senderUserId) === String(assistantUserId) ? 'assistant' : 'user',
            content: item.message.trim()
        }));
}

/**
 * One streamed round: consumes the LLM stream, forwarding reasoning and
 * answer deltas as they grow, and returns the assembled neutral message.
 */
async function streamedRound({ organizationId, profileId, model = '', system, messages, tools, signal = null, onThinking = null, onText = null }) {
    let thought = '';
    let full = '';
    let message = null;
    try {
        for await (const event of llmService.streamChatCompletion({ organizationId, profileId, model, system, messages, tools, signal })) {
            if (event.type === 'thinking') {
                thought += event.text;
                if (onThinking) onThinking(thought);
            } else if (event.type === 'text') {
                full += event.text;
                if (onText) onText(full);
            } else if (event.type === 'message') {
                message = event;
            }
        }
    } catch (error) {
        // A stopped run is not a failure: keep the partial answer it had
        // produced so far and let the caller persist that.
        if (!signal?.aborted) throw error;
        return { content: full, thinking: thought, toolCalls: [], aborted: true };
    }
    const result = message || { content: full, thinking: thought, toolCalls: [] };
    // Reconcile the live sink with the assembled message: a plain answer
    // behind a reasoning-first endpoint only reveals itself at stream end.
    if (onThinking) onThinking(result.thinking || '');
    if (onText) onText(result.content || '');
    return result;
}

/**
 * The shared bounded tool-calling loop: neutral conversation in, final
 * assistant text plus any attached instance refs out (text null when the
 * model produced nothing). Tool failures become tool-result errors the
 * model can read and adjust around. Every tool executes with `execAuth` —
 * the delegated principal's auth. The run's reasoning and tool activity
 * stay visible through `stream`; a round that ends in tool calls retracts
 * only its own answer text (only the final answer persists).
 */
async function runAgentLoop({ organizationId, execAuth, system, conversation, profileId = '', model = '', signal = null, stream = null }) {
    const tools = chatToolDescriptors();
    // Per-run side channel: chat-only tools accumulate state here that the
    // final reply consumes (instance refs the model attached mid-loop).
    const run = { instanceRefs: [] };
    // The run's visible work as one chronology, persisted onto the reply as
    // provenance: per-round reasoning segments interleaved with tool
    // invocations in the order they happened. Empty reasoning segments
    // (a reclassified reasoning-first stream) drop out.
    const steps = [];
    let segment = null;
    const visibleSteps = () => steps.filter(step => step.kind !== 'thinking' || String(step.text || '').trim());
    const publish = () => {
        // Snapshot, never live references: a published chronology must not
        // mutate under the client while the run continues.
        if (stream) stream.activity(visibleSteps().map(step => (step.kind === 'tool' ? { ...step } : { kind: 'thinking', text: step.text })));
    };
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        segment = { kind: 'thinking', text: '' };
        steps.push(segment);
        const assistant = await streamedRound({
            organizationId,
            profileId,
            model,
            system,
            messages: conversation,
            tools,
            signal,
            onThinking: stream ? (text) => {
                segment.text = text;
                publish();
            } : null,
            onText: stream ? (text) => stream.answer(text) : null
        });
        // Without a live sink nothing streamed; the round's reasoning
        // arrives only as the assembled message.
        if (!stream) segment.text = assistant.thinking || '';
        publish();
        // A stopped run keeps whatever answer it had produced; a tool round
        // that was cancelled mid-call simply has no answer to keep.
        if (assistant.aborted) {
            return { text: (assistant.content || '').trim() || null, instanceRefs: run.instanceRefs, agent: { steps: visibleSteps() }, aborted: true };
        }
        const toolCalls = assistant.toolCalls || [];
        if (!toolCalls.length) {
            return { text: (assistant.content || '').trim() || null, instanceRefs: run.instanceRefs, agent: { steps: visibleSteps() } };
        }
        // This round answered a tool call, not the room: drop its answer text.
        // The reasoning and the tool rows stay as the run's visible work.
        if (stream) stream.answer('');
        conversation.push({ role: 'assistant', content: assistant.content || '', toolCalls });
        for (const call of toolCalls) {
            const entry = { kind: 'tool', id: call.id, name: call.name, status: 'running' };
            steps.push(entry);
            publish();
            let result;
            try {
                result = await executeTool(call.name, call.arguments, execAuth, run);
                entry.status = 'done';
            } catch (error) {
                result = { error: error?.message || String(error) };
                entry.status = 'error';
                // The failure rides the step: the room sees what the tool
                // rejected, so a later prose claim can't hide it.
                entry.error = String(result.error).slice(0, 200);
            }
            publish();
            conversation.push({
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: JSON.stringify(result)
            });
        }
    }
    return { text: 'Stopped: tool round budget reached without a final answer.', instanceRefs: run.instanceRefs, agent: { steps: visibleSteps() } };
}

function replyBodyFor(context, message, text, assistantUserId, instanceRefs = [], agent = null) {
    const refs = instanceRefs.length ? { instanceRefs } : {};
    const provenance = agent ? { agent } : {};
    if (context.kind === 'direct') {
        const other = (message.participants || context.participants || [])
            .map(item => String(item))
            .find(item => item !== String(assistantUserId));
        return { recipientUserId: other, message: text, ...refs, ...provenance };
    }
    if (context.kind === 'group') {
        return { conversationKey: context.conversationKey, message: text, ...refs, ...provenance };
    }
    const link = message.instanceLink || {};
    return { instance: { type: link.type, id: link.id }, message: text, ...refs, ...provenance };
}

async function sendReply(assistantAuth, context, message, text, instanceRefs = [], agent = null) {
    await supportService.sendUserMessage(assistantAuth, replyBodyFor(context, message, text, assistantAuth.userId, instanceRefs, agent));
}

async function conversationHistory(conversationKey, assistantUserId) {
    const history = await supportService.listMessages({ conversationKey }, { limit: HISTORY_LIMIT });
    return historyMessages(history, assistantUserId);
}

/**
 * Resolves the run's delegation principal: the sender's auth plus the
 * agent-chat capability. A missing user or a member whose roles no longer
 * carry the capability yields null — the AI stays silent, exactly as a
 * member without the surface sees no AI.
 */
async function resolveDelegatedPrincipal(organizationId, userId) {
    let execAuth;
    try {
        execAuth = await buildPrincipalAuth(userId);
    } catch {
        return null;
    }
    if (!organizationId && execAuth) organizationId = execAuth.organizationId;
    if (!organizationId || !(await organizationsService.canUseAgentChats(organizationId, userId))) return null;
    return execAuth;
}

/**
 * The AI's chat answer: bounded tool loop over the shared catalog,
 * executing with the triggering sender's rights, the final assistant text
 * posted through the auth-checked send path as the assistant. Loop-level
 * failures surface as a short reply so the room never stares at silence.
 */
export async function runAssistantReply(target, context, message) {
    const lockKey = `${target.assistantId}:${message.conversationKey}`;
    if (inFlight.has(lockKey)) {
        console.warn('[AGENT-BOTS] reply skipped, another run already in flight:', lockKey);
        return;
    }
    const controller = new AbortController();
    inFlight.set(lockKey, { conversationKey: message.conversationKey, organizationId: null, controller });
    let stream = null;
    try {
        const execAuth = await resolveDelegatedPrincipal(message.organizationId || context.organizationId, message.senderUserId);
        if (!execAuth) return;
        const assistantAuth = await buildPrincipalAuth(target.assistantId);
        inFlight.get(lockKey).organizationId = assistantAuth.organizationId || execAuth.organizationId;
        stream = botActivitySink(assistantAuth, message.conversationKey);
        stream.activity([]);
        const organizationId = execAuth.organizationId;
        // Execution-point precedence: the conversation's pin, then the org
        // chat route (no per-bot brain — one AI, the org's models).
        const profileId = target.profile || '';
        const model = target.model || '';
        if (!(await llmService.isLlmAvailable(organizationId, 'chat', { profileId, model }))) {
            await sendReply(assistantAuth, context, message, 'LLM provider is not configured for this organization.');
            return;
        }
        const { text, instanceRefs, agent } = await runAgentLoop({
            organizationId,
            execAuth,
            profileId,
            model,
            system: systemPrompt(assistantAuth.name, assistantAuth.organizationData?.name || execAuth.organizationData?.name || '', execAuth.name || 'the sender'),
            conversation: await conversationHistory(message.conversationKey, target.assistantId),
            signal: controller.signal,
            stream
        });
        if (text) await sendReply(assistantAuth, context, message, text, instanceRefs, agent);
    } catch (error) {
        // A stopped run is silent: the room asked it to end.
        if (!controller.signal.aborted) {
            console.error('[AGENT-BOTS] reply failed:', error);
            try {
                const assistantAuth = await buildPrincipalAuth(target.assistantId);
                await sendReply(assistantAuth, context, message, 'The agent failed to answer; try again.');
            } catch (nested) {
                console.error('[AGENT-BOTS] failure notice failed:', nested);
            }
        }
    } finally {
        if (stream) stream.end();
        inFlight.delete(lockKey);
    }
}

/**
 * The observer registered against the support service. Fire-and-forget:
 * message persistence never awaits an LLM.
 */
export function handleMessageInserted(context, message) {
    resolveAssistantTarget(context, message)
        .then(target => (target ? runAssistantReply(target, context, message) : null))
        .catch(error => console.error('[AGENT-BOTS] trigger failed:', error));
}

export function registerSupportMessageObserver() {
    return supportService.registerMessageObserver(handleMessageInserted);
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
 * trigger message and the loop's answer lands in the subscribed
 * conversation. The run executes delegated to the matched rule's author —
 * the target instance is resolved through their access-checked read, so a
 * wake the author may not see skips, as does a missing author or one who
 * lost the capability. No provider or a failing wake logs and stays
 * silent: nobody is waiting in the room.
 */
export async function runAssistantWake(subscription, event, rule = {}) {
    const lockKey = `${subscription.botUserId}:${subscription.conversationKey}`;
    if (inFlight.has(lockKey)) {
        console.warn('[AGENT-BOTS] wake skipped, reply already in flight:', lockKey);
        return;
    }
    const controller = new AbortController();
    inFlight.set(lockKey, { conversationKey: subscription.conversationKey, organizationId: null, controller });
    let stream = null;
    try {
        const execAuth = await resolveDelegatedPrincipal(subscription.organizationId, rule.createdBy);
        if (!execAuth) return;
        const assistant = await ensureOrganizationAssistant(subscription.organizationId);
        if (!assistant) return;
        const assistantAuth = await buildPrincipalAuth(assistant.id);
        inFlight.get(lockKey).organizationId = subscription.organizationId?.toString?.() || null;
        stream = botActivitySink(assistantAuth, subscription.conversationKey);
        stream.activity([]);
        // Execution-point precedence: the wake rule's model, then this
        // conversation's, then the org chat route.
        const profileId = String(rule.profile || '') || String(subscription.profile || '');
        const model = String(subscription.model || '');
        if (!(await llmService.isLlmAvailable(subscription.organizationId, 'chat', { profileId, model }))) return;
        const service = getAppRegistry().getInstanceService(String(event.targetType || ''));
        const instance = await service?.processGetById?.(String(event.targetId || ''), execAuth).catch(() => null);
        // An unreadable or missing target skips the wake: the delegation
        // boundary — the author may not see this instance.
        if (!instance) return;
        const instanceName = instance.name || instance.identity?.name || String(event.targetId || '');
        const trigger = [
            `Lifecycle wake: ${event.targetType} "${instanceName}" (${event.targetId})`,
            `moved ${event.fromStatePrimary || '∅'} → ${event.toStatePrimary}`,
            actorLabelOf(event) ? `by ${actorLabelOf(event)}.` : '.',
            'Do the work this room expects; inspect the instance with tools if you need more than this summary.'
        ].join(' ');
        const { text, instanceRefs, agent } = await runAgentLoop({
            organizationId: subscription.organizationId,
            execAuth,
            profileId,
            model,
            system: systemPrompt(assistantAuth.name, assistantAuth.organizationData?.name || '', execAuth.name || 'the rule author'),
            conversation: [
                ...await conversationHistory(subscription.conversationKey, assistant.id),
                { role: 'user', content: trigger }
            ],
            signal: controller.signal,
            stream
        });
        if (!text) return;
        const body = postingBodyForKey(subscription.conversationKey, text);
        if (body) await supportService.sendUserMessage(assistantAuth, {
            ...body,
            ...(instanceRefs.length ? { instanceRefs } : {}),
            agent
        });
    } catch (error) {
        // A stopped wake is silent, like a failing wake: nobody is waiting.
        if (!controller.signal.aborted) console.error('[AGENT-BOTS] wake failed:', error);
    } finally {
        if (stream) stream.end();
        inFlight.delete(lockKey);
    }
}
