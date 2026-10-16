import { createError } from 'h3';
import * as usersService from '~/server/features/users/service.js';
import * as supportService from '~/server/features/support/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
import * as llmService from '~/server/features/llm/service.js';
import * as repository from './repository.js';

/**
 * The organization AI (SPEC: agent access). There are no created bots:
 * one assistant member per organization is the AI's attribution identity,
 * and every run executes delegated to a user's auth — the chatting user
 * for replies (runtime.js), the wake-rule author for wakes. This service
 * owns the assistant bootstrap, the capability gate, and the
 * conversation subscription join; the chat runtime lives in runtime.js
 * and the tool catalog in tools.js.
 */

async function assertAgentChatAccess(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!auth.organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
    if (!(await organizationsService.canUseAgentChats(auth.organizationId, auth.userId))) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
}

/**
 * Any member's request-shaped auth: the same construction as the auth
 * middleware (pre-process context widened through resolveProcessAuth),
 * so delegated tool calls and sends hit identical access gates as that
 * user's own requests.
 */
export async function buildPrincipalAuth(userId) {
    const user = await usersService.getById(userId);
    if (!user) throw createError({ statusCode: 404, message: 'User not found' });
    const authContext = usersService.buildAuthContext(user);
    if (user.organizationId) {
        const org = await organizationsRepository.findById(user.organizationId);
        if (org) {
            authContext.organizationData = {
                _id: org._id.toString(),
                name: org.identity?.name || 'Unnamed Organization',
                type: org.data?.type || 'Customer'
            };
        }
    }
    return await resolveProcessAuth(authContext);
}

export async function isBotUser(userId) {
    if (!userId) return false;
    const user = await usersService.getById(userId).catch(() => null);
    return Boolean(user?.data?.bot);
}

// --- The organization assistant ---------------------------------------------

const ASSISTANT_NAME = 'Assistant';
const assistantEmailFor = (organizationId) => `assistant-${organizationId}@bots.perigram.internal`;

/**
 * The organization's single AI identity (SPEC: agent access), lazily
 * bootstrapped through its deterministic address — collision means it
 * exists, so bootstrap is idempotent across workers. The assistant
 * carries no roles and no token: it is an attribution identity, and
 * runs execute delegated to users.
 */
export async function ensureOrganizationAssistant(organizationId) {
    const orgId = organizationId?.toString?.().trim?.() || '';
    if (!orgId) return null;
    const existing = await usersService
        .findUserByEmail(assistantEmailFor(orgId))
        .catch(() => null);
    if (existing?.data?.bot) return existing;
    try {
        const { user } = await usersService.registerBot({
            name: ASSISTANT_NAME,
            organizationId: orgId,
            email: assistantEmailFor(orgId)
        });
        return user;
    } catch (error) {
        // Concurrent bootstrap in another worker registered first: the
        // deterministic address collided — resolve and reuse that one.
        if (error?.statusCode === 409) {
            const winner = await usersService
                .findUserByEmail(assistantEmailFor(orgId))
                .catch(() => null);
            if (winner?.data?.bot) return winner;
        }
        throw error;
    }
}

async function assistantParticipantId(participants = []) {
    for (const participant of participants) {
        if (await isBotUser(participant)) return String(participant);
    }
    return null;
}

// --- Conversation membership -------------------------------------------------

const WAKE_RULES_MAX = 20;

function normalizeWakeOn(wakeOn, authorUserId) {
    if (wakeOn === undefined || wakeOn === null) return null;
    if (!Array.isArray(wakeOn)) {
        throw createError({ statusCode: 400, message: 'wakeOn must be an array of { type, state } rules' });
    }
    if (wakeOn.length > WAKE_RULES_MAX) {
        throw createError({ statusCode: 400, message: `wakeOn accepts at most ${WAKE_RULES_MAX} rules` });
    }
    return wakeOn.map((rule) => {
        const type = String(rule?.type || '').trim();
        const state = String(rule?.state || '').trim();
        if (!type || !state) {
            throw createError({ statusCode: 400, message: 'wakeOn rules require type and state' });
        }
        const profile = String(rule?.profile || '').trim();
        // The rule's author is its delegation principal when it fires.
        return profile ? { type, state, profile, createdBy: authorUserId } : { type, state, createdBy: authorUserId };
    });
}

/**
 * Bringing the AI into a conversation. Group subscriptions also join the
 * assistant into the group's participants (posting admission is
 * participant-scoped); instance conversations have no participant list
 * and the subscription is the whole membership. Direct conversations
 * answer implicitly — a subscription row there only pins the room's
 * model. `wakeOn` carries the subscription's lifecycle wake rules (see
 * the wake scanner): omitted leaves stored rules untouched, `null`/`[]`
 * clears them, a non-empty array replaces them — each rule authored by,
 * and delegated to, the calling user.
 */
export async function subscribeAssistant(auth, body = {}) {
    await assertAgentChatAccess(auth);
    const conversationKey = String(body?.conversationKey || '').trim();
    if (!conversationKey) throw createError({ statusCode: 400, message: 'conversationKey is required' });
    const wakeOn = normalizeWakeOn(body?.wakeOn, auth.userId);
    // Model selection at the execution point: the subscription (this
    // conversation) may pin a chat profile and a model off that profile's
    // endpoint. Unknown ids are refused here; stale stored ones degrade
    // to the org chat route at resolution time.
    const allowedProfiles = await llmService.chatProfileIds(auth.organizationId);
    const profile = String(body?.profile || '').trim();
    if (profile && !allowedProfiles.includes(profile)) {
        throw createError({ statusCode: 400, message: `Unknown chat profile: ${profile}` });
    }
    const model = String(body?.model || '').trim();
    for (const rule of wakeOn || []) {
        if (rule.profile && !allowedProfiles.includes(rule.profile)) {
            throw createError({ statusCode: 400, message: `Unknown chat profile on wake rule: ${rule.profile}` });
        }
    }

    // Conversation admission runs through the support context resolution —
    // the same check that authorizes SSE topics and message reads.
    const context = await supportService.getConversationContextByKey(auth, conversationKey);
    if (context.kind === 'direct') {
        // Direct chats carry no membership, but the conversation is still a
        // model execution point: a profile-only row (no wake rules — status
        // transitions never fire there).
        const participants = (context.participants || []).map(item => String(item));
        const assistantId = await assistantParticipantId(participants);
        if (!assistantId) {
            throw createError({ statusCode: 400, message: 'This conversation has no AI participant' });
        }
        if (wakeOn?.length) {
            throw createError({ statusCode: 400, message: 'Direct chats carry no wake rules' });
        }
        await repository.upsertSubscription({
            botUserId: assistantId,
            conversationKey: context.conversationKey,
            conversationKind: 'direct',
            organizationId: auth.organizationId,
            profile,
            model
        });
        return { assistantId, conversationKey: context.conversationKey, subscribed: true, profile, ...(model ? { model } : {}) };
    }
    const assistant = await ensureOrganizationAssistant(auth.organizationId);
    if (!assistant) throw createError({ statusCode: 404, message: 'Assistant not found' });
    if (context.kind === 'group') {
        await supportService.addBotGroupParticipant(auth, context.groupId, assistant.id);
    }
    await repository.upsertSubscription({
        botUserId: assistant.id,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        // The org whose assistant is seated — wakes resolve the same
        // assistant through this row.
        organizationId: auth.organizationId,
        ...(wakeOn ? { wakeOn } : {}),
        profile,
        model
    });
    return {
        assistantId: assistant.id,
        conversationKey: context.conversationKey,
        subscribed: true,
        profile,
        ...(model ? { model } : {}),
        ...(wakeOn ? { wakeOn } : {})
    };
}

export async function unsubscribeAssistant(auth, body = {}) {
    await assertAgentChatAccess(auth);
    const conversationKey = String(body?.conversationKey || '').trim();
    if (!conversationKey) throw createError({ statusCode: 400, message: 'conversationKey is required' });
    const context = await supportService.getConversationContextByKey(auth, conversationKey);
    const assistantId = context.kind === 'direct'
        ? await assistantParticipantId((context.participants || []).map(item => String(item)))
        : (await ensureOrganizationAssistant(auth.organizationId))?.id || null;
    if (context.kind === 'group' && assistantId) {
        await supportService.removeBotGroupParticipant(auth, context.groupId, assistantId);
    }
    if (assistantId) await repository.removeSubscription(assistantId, context.conversationKey);
    return { assistantId, conversationKey: context.conversationKey, subscribed: false };
}

// --- The member-visible AI contact -------------------------------------------

function assistantContactRow(assistant, subscription) {
    const dto = assistant.toJSON();
    return {
        id: dto._id ?? dto.id,
        name: dto.identity?.name || '',
        avatarUrl: dto.data?.avatarUrl || null,
        subscribed: Boolean(subscription),
        profile: subscription?.profile || '',
        model: subscription?.model || '',
        wakeOn: subscription?.wakeOn || []
    };
}

/**
 * The chat pickers' AI row: ensures the org assistant exists and — when
 * a conversation key is supplied and the caller is admitted to it —
 * decorates it with the room's subscription (model pin, wake rules).
 * Only members holding the agent-chat capability get the AI at all
 * (SPEC: everyone else sees no AI surface).
 */
export async function listAssistantContact(auth, conversationKey = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!auth.organizationId) return { canChat: false, assistant: null, chatProfiles: [], chatModels: [] };
    if (!(await organizationsService.canUseAgentChats(auth.organizationId, auth.userId))) {
        return { canChat: false, assistant: null, chatProfiles: [], chatModels: [] };
    }
    const assistant = await ensureOrganizationAssistant(auth.organizationId);

    let subscription = null;
    const key = String(conversationKey || '').trim();
    if (key && assistant) {
        const context = await supportService.getConversationContextByKey(auth, key);
        [subscription] = await repository.findSubscriptionsByConversation([context.conversationKey]);
    }
    return {
        canChat: true,
        assistant: assistant ? assistantContactRow(assistant, subscription) : null,
        chatProfiles: await llmService.chatProfiles(auth.organizationId),
        chatModels: await llmService.chatModels(auth.organizationId),
        // The org chat route's resolved model — the room select's
        // never-blank fallback when no pin exists.
        chatRouteModel: (await llmService.resolveLlmConfig(auth.organizationId, 'chat'))?.model || ''
    };
}

/**
 * Wake-rule picker options: the organization's active compiled machines'
 * emitted types with their primary-region state paths.
 */
export async function listWakeOptions(auth) {
    await assertAgentChatAccess(auth);
    return await processDefinitionsService.listActiveWorkflowStates(auth);
}
