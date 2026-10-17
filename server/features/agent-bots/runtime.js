import * as llmService from '~/server/features/llm/service.js';
import * as supportService from '~/server/features/support/service.js';
import * as connectionsService from '~/server/features/connections/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import { MESSAGE_SENDER } from '~/server/features/support/const.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { buildPrincipalAuth, ensureOrganizationAssistant, getBotIdentity, ASSISTANT_NAME } from './service.js';
import * as botRepository from './repository.js';
import { executeTool, chatToolDescriptors, toolCallDetail } from './tools.js';

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

// One in-flight run per room: the SUBSCRIBED conversation owns the lock
// (chat replies and wakes share it), so bursts and ancestor-subscribed
// triggers serialize instead of racing. A trigger arriving mid-run is
// coalesced, never dropped — the latest waits as `pending` and re-fires
// once the current run lands, its history re-snapshot covering everything
// said meanwhile. Each entry carries the run's cancellation handle and
// every conversation key its stop may arrive from (the room plus the
// trigger's fanout keys).
const inFlight = new Map();

function refirePending(pending) {
    const run = pending.kind === 'wake'
        ? runAssistantWake(pending.subscription, pending.event, pending.rule)
        : runAssistantReply(pending.target, pending.context, pending.message);
    run.catch(error => console.error('[AGENT-BOTS] deferred run failed:', error));
}

// A room's suspended question (ask_user): the run waits inside the tool
// until the next capability-holding participant message in the asking
// conversation answers it (consumed by the observer below — never a new
// trigger), the room stops the run, or the question times out.
const pendingAsks = new Map();
const ASK_TIMEOUT_MS = 10 * 60_000;

function waitForRoomAnswer(conversationKey, organizationId, signal) {
    return new Promise((resolve, reject) => {
        const entry = { organizationId, resolve, timer: null, onAbort: null };
        const settle = (outcome) => {
            clearTimeout(entry.timer);
            signal?.removeEventListener?.('abort', entry.onAbort);
            pendingAsks.delete(conversationKey);
            outcome();
        };
        entry.timer = setTimeout(() => {
            settle(() => reject(new Error('The room did not answer within 10 minutes — conclude with what you have and state exactly what input is still needed.')));
        }, ASK_TIMEOUT_MS);
        entry.onAbort = () => {
            settle(() => reject(Object.assign(new Error('The run was stopped'), { name: 'AbortError' })));
        };
        if (signal?.aborted) {
            entry.onAbort();
            return;
        }
        signal?.addEventListener?.('abort', entry.onAbort);
        pendingAsks.set(conversationKey, entry);
    });
}

/**
 * The observer's ask routing: a message in a conversation with a
 * suspended question, from a sender holding the agent-chat capability,
 * is that question's answer — it steers the waiting run and never fires
 * a new one. Everything else (bots, the capability-less, other rooms)
 * falls through to the normal trigger.
 */
async function consumePendingAsk(context, message) {
    const key = String(message?.conversationKey || context?.conversationKey || '');
    const ask = pendingAsks.get(key);
    if (!ask) return false;
    if (!message || context.kind === 'support') return false;
    if (message.sender && message.sender !== MESSAGE_SENDER.USER) return false;
    if (await senderIsBot(message.senderUserId)) return false;
    if (!(await organizationsService.canUseAgentChats(ask.organizationId, message.senderUserId))) return false;
    pendingAsks.delete(key);
    clearTimeout(ask.timer);
    ask.resolve(String(message.message || '').trim());
    return true;
}

/**
 * Stops every in-flight run reachable from one conversation key — the
 * subscribed room's or any view the trigger message fans out to. Aborting
 * the run's controller unwinds the LLM stream; the loop then keeps
 * whatever answer it had produced. Org-scoped when both sides know the
 * organization. A stopped room stays stopped: its coalesced trigger is
 * dropped with it.
 */
export function stopConversationRuns(organizationId, conversationKey) {
    let stopped = 0;
    for (const entry of inFlight.values()) {
        const keys = entry.stopKeys || [entry.conversationKey];
        if (!keys.includes(String(conversationKey))) continue;
        if (entry.organizationId && organizationId && String(entry.organizationId) !== String(organizationId)) continue;
        entry.pending = null;
        entry.controller.abort();
        stopped += 1;
    }
    return stopped;
}

/**
 * Room presence for the AI's run as it is produced: the runtime owns no
 * delivery channel, so the run's activity rides the conversation topics —
 * every key the trigger message fans out to, so the subscribed ancestor
 * view (the organization chat) sees the run beside the trigger exactly
 * like the message itself. `bot_activity` carries the run's chronology so
 * far (per-round reasoning segments interleaved with tool invocations, in
 * the order they happened), `bot_stream` the answer so far, and
 * `bot_stream_end` clears the run once the persisted message supersedes
 * it.
 */
function botActivitySink(assistantAuth, conversationKeys) {
    const keys = [...new Set((conversationKeys || []).map(key => String(key || '')).filter(Boolean))];
    const publish = (type, fields = {}) => {
        for (const key of keys) {
            connectionsService.publish(`conversation:${key}`, {
                conversationKey: key,
                userId: assistantAuth.userId,
                name: assistantAuth.name || '',
                type,
                ...fields
            });
        }
    };
    return {
        // Absolute state, not deltas: each publish carries the whole
        // chronology so far, and each round reconciles with the assembled
        // message, so a reasoning-first stream that turns out to be a
        // plain answer can reclassify without the client accumulating
        // garbage.
        activity(steps) {
            publish('bot_activity', { steps });
        },
        answer(text) {
            publish('bot_stream', { text });
        },
        // The suspended question (ask_user): rendered at the composer
        // until answered, stopped, or timed out.
        question(question, options = []) {
            publish('bot_question', { question, options });
        },
        questionEnd() {
            publish('bot_question_end');
        },
        end() {
            publish('bot_stream_end');
        }
    };
}

const botIdentityCache = new Map();
const BOT_FLAG_TTL_MS = 60_000;

async function cachedBotIdentity(userId) {
    const key = String(userId || '');
    if (!key) return null;
    const cached = botIdentityCache.get(key);
    if (cached && Date.now() - cached.at < BOT_FLAG_TTL_MS) return cached.identity;
    const identity = await getBotIdentity(key);
    botIdentityCache.set(key, { at: Date.now(), identity });
    return identity;
}

async function senderIsBot(userId) {
    return Boolean(await cachedBotIdentity(userId));
}

/**
 * The multi-human room's wake gate (SPEC: agent access): `@` plus the
 * assistant's name, case-insensitive, ending at a word boundary.
 */
function messageMentionsAssistant(message, assistantName) {
    const text = String(message?.message || '');
    const name = String(assistantName || '').trim();
    if (!text || !name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
}

/**
 * Conversation keys a message belongs to, in execution-point order: its own
 * thread first, then the instance path's ancestors nearest-first — the AI
 * subscribed to any of them answers beside the message, and the first
 * subscribed key wins the room's model pin.
 */
function candidateConversationKeys(context, message) {
    const keys = [];
    const own = String(message.conversationKey || context.conversationKey || '');
    if (own) keys.push(own);
    const path = Array.isArray(message.instancePath) ? message.instancePath : [];
    for (let index = path.length - 1; index >= 0; index -= 1) {
        const entry = path[index];
        if (!entry?.type || !entry?.id) continue;
        const key = supportService.instanceConversationKey(entry.type, entry.id);
        if (!keys.includes(key)) keys.push(key);
    }
    return keys;
}

/**
 * Trigger rules: support-channel messages never trigger; the AI never
 * triggers itself (no loops); direct conversations answer implicitly when
 * the assistant is a participant; group and instance conversations answer
 * through subscriptions — group rooms additionally require the assistant's
 * participants entry, and multi-human rooms only when the message names
 * the assistant (a two-participant assistant room is the AI's own
 * person-style thread and answers every message). The sender's capability
 * and organization are checked at run time, not here — resolution stays
 * purely structural.
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
        const conversationKey = String(message.conversationKey || context.conversationKey || '');
        const [row] = await botRepository.findSubscriptionsByConversation([conversationKey]);
        return {
            assistantId: bots[0],
            roomKey: conversationKey,
            profile: String(row?.profile || ''),
            model: String(row?.model || ''),
            organizationId: row?.organizationId ? String(row.organizationId) : ''
        };
    }

    const candidates = candidateConversationKeys(context, message);
    const subscriptions = await botRepository.findSubscriptionsByConversation(candidates);
    if (!subscriptions.length) return null;
    // One AI, one room: the first subscribed key in execution-point order
    // (own thread, then nearest ancestor) is the room that answers.
    const byKey = new Map(subscriptions.map(row => [String(row.conversationKey), row]));
    const roomKey = candidates.find(key => byKey.has(key));
    const row = byKey.get(roomKey);
    const assistantId = String(row.botUserId);
    if (context.kind === 'group') {
        const participants = (message.participants || context.participants || []).map(item => String(item));
        if (!participants.includes(assistantId)) return null;
        if (participants.length > 2) {
            const identity = await cachedBotIdentity(assistantId);
            if (!messageMentionsAssistant(message, identity?.name || ASSISTANT_NAME)) return null;
        }
    } else {
        const identity = await cachedBotIdentity(assistantId);
        if (!messageMentionsAssistant(message, identity?.name || ASSISTANT_NAME)) return null;
    }
    return {
        assistantId,
        roomKey,
        profile: String(row.profile || ''),
        model: String(row.model || ''),
        organizationId: row.organizationId ? String(row.organizationId) : ''
    };
}

function systemPrompt(assistantName, organizationName, principalName) {
    return [
        `You are ${assistantName}, the organization AI operating inside Perigram — a process programming platform — for the organization "${organizationName}".`,
        `You are acting for ${principalName}: every tool call runs with exactly their access rights — you can read and do what they may, and nothing beyond it.`,
        'You manipulate process definitions and instances through the provided tools, which enforce the same access rules as every other client.',
        'Act on the user\'s declared intent without asking permission first — do the work, then report what happened. Activation gates are the only confirmations: when one carries live data (status migration targets, type death), ask_user once with the concrete impact and options instead of guessing or giving up. Tool errors are fix instructions, not dead ends: read the message, correct the input, and retry in the same run — never ask the user whether to retry.',
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
        .map(item => {
            const content = item.message.trim();
            // Attachments ride the history as addressable markers — the
            // model reads them through read_attachment, scoped to this
            // conversation's own messages.
            const markers = (Array.isArray(item.attachments) ? item.attachments : [])
                .filter(attachment => attachment?.fileId)
                .map(attachment => `[attachment: ${attachment.name || 'file'} <fileId:${attachment.fileId}>]`)
                .join('\n');
            return {
                role: String(item.senderUserId) === String(assistantUserId) ? 'assistant' : 'user',
                content: markers ? `${content}\n${markers}` : content
            };
        });
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
async function runAgentLoop({ organizationId, execAuth, system, conversation, conversationKey = '', profileId = '', model = '', signal = null, stream = null, ask = null }) {
    // The descriptor surface is org-aware: a capability the org has not
    // configured (web search without a provider) never reaches the model.
    const tools = await chatToolDescriptors(organizationId);
    // Per-run side channel: chat-only tools accumulate state here that the
    // final reply consumes (instance refs the model attached mid-loop),
    // the run's conversation key scopes their reach (read_attachment
    // reads only this room's attachments), and `ask` suspends the run on
    // the room's next answer (ask_user).
    const run = { conversationKey, instanceRefs: [], ...(ask ? { ask } : {}) };
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
    // No round budget (owner direction 2026-10-16): the loop runs until the
    // model answers; the room's stop control and the provider idle guard
    // are the only terminators. Identical-call repetition tracking is the
    // one in-loop brake (see the tool execution loop).
    let lastCallSignature = null;
    let repeatCount = 0;
    for (;;) {
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
        }).catch(error => {
            // A dead provider must not discard the run's chronology: the
            // failure notice rides the same provenance as an answer, so
            // the room keeps what the run had done (owner defect
            // 2026-10-17: "all thinking disappeared").
            if (signal?.aborted) throw error;
            return { content: '', thinking: '', toolCalls: [], failed: error };
        });
        // Without a live sink nothing streamed; the round's reasoning
        // arrives only as the assembled message.
        if (!stream) segment.text = assistant.thinking || '';
        publish();
        if (assistant.failed) {
            return { text: null, instanceRefs: run.instanceRefs, agent: { steps: visibleSteps() }, failed: assistant.failed };
        }
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
            // The call's human detail (definition name, type, action id)
            // rides the step from the start, so the live chronology and
            // the persisted provenance cite the same target.
            const detail = toolCallDetail(call.name, call.arguments);
            if (detail) entry.detail = detail;
            steps.push(entry);
            publish();
            // Loop protection, not a round budget: the exact same call
            // landing a third time means the model is repeating a failed
            // attempt verbatim (observed live 2026-10-17: five identical
            // failing edits) — it gets a structured instruction to change
            // approach instead of another identical failure. A changed
            // argument list always proceeds.
            const signature = `${call.name}:${JSON.stringify(call.arguments || {})}`;
            if (signature === lastCallSignature) repeatCount += 1;
            else {
                lastCallSignature = signature;
                repeatCount = 0;
            }
            if (repeatCount >= 2) {
                const notice = 'This exact call was already made and failed twice in this run. Repeating it identical will fail again — change the inputs or the approach, or ask the room with ask_user.';
                entry.status = 'error';
                entry.error = notice.slice(0, 200);
                publish();
                conversation.push({
                    role: 'tool',
                    toolCallId: call.id,
                    name: call.name,
                    content: JSON.stringify({ error: notice })
                });
                continue;
            }
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
}

function replyBodyFor(context, message, text, assistantUserId, instanceRefs = [], agent = null, notice = null) {
    const refs = instanceRefs.length ? { instanceRefs } : {};
    const provenance = agent ? { agent } : {};
    const noticeField = notice ? { notice } : {};
    if (context.kind === 'direct') {
        const other = (message.participants || context.participants || [])
            .map(item => String(item))
            .find(item => item !== String(assistantUserId));
        return { recipientUserId: other, message: text, ...refs, ...provenance, ...noticeField };
    }
    if (context.kind === 'group') {
        return { conversationKey: context.conversationKey, message: text, ...refs, ...provenance, ...noticeField };
    }
    const link = message.instanceLink || {};
    return { instance: { type: link.type, id: link.id }, message: text, ...refs, ...provenance, ...noticeField };
}

async function sendReply(assistantAuth, execAuth, context, message, text, instanceRefs = [], agent = null, notice = null) {
    await supportService.sendUserMessage(assistantAuth, replyBodyFor(context, message, text, assistantAuth.userId, instanceRefs, agent, notice), { refsAuth: execAuth });
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

// ask_user's runtime half: publish the question through the run's sink,
// wait for the room's answer (the observer consumes it), and always
// clear the question card — answered, stopped, or timed out.
function askRoom(stream, conversationKey, organizationId, signal, question, options) {
    if (stream) stream.question(question, options);
    return waitForRoomAnswer(conversationKey, organizationId, signal)
        .finally(() => { if (stream) stream.questionEnd(); });
}

/**
 * The AI's chat answer: bounded tool loop over the shared catalog,
 * executing with the triggering sender's rights, the final assistant text
 * posted through the auth-checked send path as the assistant. Loop-level
 * failures surface as a short reply so the room never stares at silence.
 */
export async function runAssistantReply(target, context, message) {
    const roomKey = String(target.roomKey || message.conversationKey || '');
    const lockKey = `${target.assistantId}:${roomKey}`;
    const existing = inFlight.get(lockKey);
    if (existing) {
        // Coalesce, never drop: the latest trigger answers once the
        // current run lands.
        existing.pending = { kind: 'reply', target, context, message };
        return;
    }
    const controller = new AbortController();
    const fanoutKeys = candidateConversationKeys(context, message);
    const stopKeys = [...new Set([roomKey, ...fanoutKeys])];
    inFlight.set(lockKey, { conversationKey: roomKey, stopKeys, organizationId: null, controller, pending: null });
    let stream = null;
    // Hoisted: the failure notice in the catch needs the delegated
    // principal, and a try-scoped const is invisible there.
    let execAuth = null;
    try {
        execAuth = await resolveDelegatedPrincipal(
            target.organizationId || message.organizationId || context.organizationId,
            message.senderUserId
        );
        if (!execAuth) return;
        // The subscription's org is the wake boundary: an assistant answers
        // only its own organization's members (a shared group's foreign
        // participant stays silent).
        if (target.organizationId && String(execAuth.organizationId || '') !== target.organizationId) return;
        const assistantAuth = await buildPrincipalAuth(target.assistantId);
        inFlight.get(lockKey).organizationId = target.organizationId || assistantAuth.organizationId || execAuth.organizationId;
        stream = botActivitySink(assistantAuth, fanoutKeys);
        stream.activity([]);
        const organizationId = target.organizationId || execAuth.organizationId;
        // Execution-point precedence: the conversation's pin, then the org
        // chat route (no per-bot brain — one AI, the org's models).
        const profileId = target.profile || '';
        const model = target.model || '';
        if (!(await llmService.isLlmAvailable(organizationId, 'chat', { profileId, model }))) {
            await sendReply(assistantAuth, execAuth, context, message, 'LLM provider is not configured for this organization.', [], null, 'warn');
            return;
        }
        const { text, instanceRefs, agent, failed } = await runAgentLoop({
            organizationId,
            execAuth,
            profileId,
            model,
            conversationKey: message.conversationKey,
            ask: (question, options) => askRoom(stream, String(message.conversationKey), organizationId, controller.signal, question, options),
            system: systemPrompt(assistantAuth.name, assistantAuth.organizationData?.name || execAuth.organizationData?.name || '', execAuth.name || 'the sender'),
            conversation: await conversationHistory(message.conversationKey, target.assistantId),
            signal: controller.signal,
            stream
        });
        if (failed) {
            // The notice carries the run's chronology: a dead provider
            // must not erase the room's record of what the run did.
            console.error('[AGENT-BOTS] reply failed:', failed);
            await sendReply(assistantAuth, execAuth, context, message, 'The agent failed to answer; try again.', instanceRefs, agent, 'error');
            return;
        }
        if (text) await sendReply(assistantAuth, execAuth, context, message, text, instanceRefs, agent);
    } catch (error) {
        // A stopped run is silent: the room asked it to end.
        if (!controller.signal.aborted) {
            console.error('[AGENT-BOTS] reply failed:', error);
            try {
                const assistantAuth = await buildPrincipalAuth(target.assistantId);
                // A failure notice carries no attached refs; the refs auth
                // falls back to the assistant when the run died before the
                // delegation resolved.
                await sendReply(assistantAuth, execAuth || assistantAuth, context, message, 'The agent failed to answer; try again.', [], null, 'error');
            } catch (nested) {
                console.error('[AGENT-BOTS] failure notice failed:', nested);
            }
        }
    } finally {
        if (stream) stream.end();
        const pending = inFlight.get(lockKey)?.pending || null;
        inFlight.delete(lockKey);
        if (pending && !controller.signal.aborted) refirePending(pending);
    }
}

/**
 * The observer registered against the support service. Fire-and-forget:
 * message persistence never awaits an LLM. A message answering the
 * room's suspended question steers the waiting run instead of triggering
 * a new one.
 */
export function handleMessageInserted(context, message) {
    consumePendingAsk(context, message)
        .then(consumed => {
            if (consumed) return null;
            return resolveAssistantTarget(context, message)
                .then(target => (target ? runAssistantReply(target, context, message) : null));
        })
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
    const existing = inFlight.get(lockKey);
    if (existing) {
        // Coalesce with the room's in-flight run: the wake re-fires once it
        // lands (chat replies and wakes share the lock space).
        existing.pending = { kind: 'wake', subscription, event, rule };
        return;
    }
    const controller = new AbortController();
    inFlight.set(lockKey, {
        conversationKey: subscription.conversationKey,
        stopKeys: [String(subscription.conversationKey)],
        organizationId: null,
        controller,
        pending: null
    });
    let stream = null;
    try {
        const execAuth = await resolveDelegatedPrincipal(subscription.organizationId, rule.createdBy);
        if (!execAuth) return;
        const assistant = await ensureOrganizationAssistant(subscription.organizationId);
        if (!assistant) return;
        const assistantAuth = await buildPrincipalAuth(assistant.id);
        inFlight.get(lockKey).organizationId = subscription.organizationId?.toString?.() || null;
        stream = botActivitySink(assistantAuth, [subscription.conversationKey]);
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
            conversationKey: subscription.conversationKey,
            ask: (question, options) => askRoom(stream, String(subscription.conversationKey), subscription.organizationId, controller.signal, question, options),
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
        }, { refsAuth: execAuth });
    } catch (error) {
        // A stopped wake is silent, like a failing wake: nobody is waiting.
        if (!controller.signal.aborted) console.error('[AGENT-BOTS] wake failed:', error);
    } finally {
        if (stream) stream.end();
        const pending = inFlight.get(lockKey)?.pending || null;
        inFlight.delete(lockKey);
        if (pending && !controller.signal.aborted) refirePending(pending);
    }
}
