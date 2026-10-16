import { createError } from 'h3';
import * as usersService from '~/server/features/users/service.js';
import * as supportService from '~/server/features/support/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
import * as llmService from '~/server/features/llm/service.js';
import * as repository from './repository.js';

/**
 * Agent bots are organization members (see the users feature for the bot
 * marker and token). This service owns bot administration and the
 * conversation subscription join; the chat runtime lives in runtime.js and
 * the tool catalog in tools.js.
 */

function assertBotManager(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!auth.organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
    if (!usersService.canManageUsersInOrganization(auth, auth.organizationId)) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
}

function botDTO(user) {
    const dto = user.toJSON();
    return {
        id: dto._id ?? dto.id,
        name: dto.identity?.name || '',
        avatarUrl: dto.data?.avatarUrl || null,
        createdAt: dto.data?.bot?.createdAt || null,
        profile: dto.data?.bot?.profile || ''
    };
}

export async function listBots(auth) {
    assertBotManager(auth);
    const members = await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
    return (members || [])
        .filter(member => member?.data?.bot)
        .map(botDTO);
}

export async function createBot(auth, body = {}) {
    assertBotManager(auth);
    const name = String(body?.name || '').trim();
    if (!name) throw createError({ statusCode: 400, message: 'Bot name is required' });
    const roleIds = [...new Set(Array.isArray(body?.roleIds) ? body.roleIds : [])];
    const { user, token } = await usersService.registerBot(
        { name, organizationId: auth.organizationId, roleIds },
        auth.userId
    );
    return { ...botDTO(user), token };
}

export async function deleteBot(auth, botId = '') {
    assertBotManager(auth);
    const bot = await usersService.getById(botId);
    if (!bot?.data?.bot) throw createError({ statusCode: 404, message: 'Bot not found' });
    await repository.removeSubscriptionsByBot(bot.id);
    await usersService.remove(bot.id, auth);
    return { deleted: true };
}

/**
 * A bot's model override: a chat-kind profile id from the org's model
 * table, or empty for the org's chat route. A stale id (profile since
 * deleted) is accepted — resolution degrades to the route chain — but a
 * nonexistent or image-kind id is refused here.
 */
export async function setBotProfile(auth, botId = '', profile = '') {
    assertBotManager(auth);
    const bot = await usersService.getById(botId);
    if (!bot?.data?.bot) throw createError({ statusCode: 404, message: 'Bot not found' });
    const target = String(profile || '').trim();
    if (target) {
        const allowed = await llmService.chatProfileIds(auth.organizationId);
        if (!allowed.includes(target)) {
            throw createError({ statusCode: 400, message: `Unknown chat profile: ${target}` });
        }
    }
    await usersService.updateBotProfile(bot.id, target);
    return { id: bot.id, profile: target };
}

export async function rotateBotToken(auth, botId = '') {
    assertBotManager(auth);
    const bot = await usersService.getById(botId);
    if (!bot?.data?.bot) throw createError({ statusCode: 404, message: 'Bot not found' });
    return { token: await usersService.rotateBotToken(bot.id, auth.userId) };
}

const WAKE_RULES_MAX = 20;

function normalizeWakeOn(wakeOn) {
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
        return profile ? { type, state, profile } : { type, state };
    });
}

/**
 * The conversation membership join. Group subscriptions also join the bot
 * into the group's participants (posting admission is participant-scoped);
 * instance conversations have no participant list and the subscription is
 * the whole membership. Direct conversations are never subscribed — bots
 * answer them implicitly. `wakeOn` carries the subscription's lifecycle
 * wake rules (see the wake scanner): omitted leaves stored rules
 * untouched, `null`/`[]` clears them, a non-empty array replaces them.
 */
export async function subscribeBot(auth, body = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const conversationKey = String(body?.conversationKey || '').trim();
    const botId = String(body?.botId || '').trim();
    if (!conversationKey || !botId) throw createError({ statusCode: 400, message: 'botId and conversationKey are required' });
    const wakeOn = normalizeWakeOn(body?.wakeOn);
    const bot = await usersService.getById(botId);
    if (!bot?.data?.bot) throw createError({ statusCode: 404, message: 'Bot not found' });
    // Model selection at the execution point: the subscription (this bot,
    // this conversation) and each wake rule may carry a chat profile that
    // overrides the bot's own. Unknown ids are refused here; stale stored
    // ones degrade to the next precedence level at resolution time.
    const allowedProfiles = await llmService.chatProfileIds(auth.organizationId);
    const profile = String(body?.profile || '').trim();
    if (profile && !allowedProfiles.includes(profile)) {
        throw createError({ statusCode: 400, message: `Unknown chat profile: ${profile}` });
    }
    // The execution point's model choice off the profile's endpoint — the
    // picker offers exactly what the endpoint serves, so no allowlist
    // here; an unserved model fails the run with the provider's own error.
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
        if (!participants.includes(bot.id)) {
            throw createError({ statusCode: 400, message: 'Bot is not a participant of this chat' });
        }
        if (wakeOn?.length) {
            throw createError({ statusCode: 400, message: 'Direct chats carry no wake rules' });
        }
        await repository.upsertSubscription({
            botUserId: bot.id,
            conversationKey: context.conversationKey,
            conversationKind: 'direct',
            organizationId: context.organizationId || auth.organizationId,
            profile,
            ...(model ? { model } : {})
        });
        return { botId: bot.id, conversationKey: context.conversationKey, subscribed: true, profile, ...(model ? { model } : {}) };
    }
    if (context.kind === 'group') {
        await supportService.addBotGroupParticipant(auth, context.groupId, botId);
    }
    await repository.upsertSubscription({
        botUserId: bot.id,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        organizationId: context.organizationId || auth.organizationId,
        ...(wakeOn ? { wakeOn } : {}),
        profile,
        ...(model ? { model } : {})
    });
    return { botId: bot.id, conversationKey: context.conversationKey, subscribed: true, profile, ...(model ? { model } : {}), ...(wakeOn ? { wakeOn } : {}) };
}

export async function unsubscribeBot(auth, body = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const conversationKey = String(body?.conversationKey || '').trim();
    const botId = String(body?.botId || '').trim();
    if (!conversationKey || !botId) throw createError({ statusCode: 400, message: 'botId and conversationKey are required' });
    const context = await supportService.getConversationContextByKey(auth, conversationKey);
    if (context.kind === 'group') {
        await supportService.removeBotGroupParticipant(auth, context.groupId, botId);
    }
    await repository.removeSubscription(botId, context.conversationKey);
    return { botId, conversationKey: context.conversationKey, subscribed: false };
}

/**
 * The bot picker row set for one conversation: every org bot with its
 * subscription flag and wake rules for the requested key.
 */
export async function listConversationBots(auth, conversationKey = '') {
    assertBotManager(auth);
    const key = String(conversationKey || '').trim();
    const bots = await listBots(auth);
    if (!key) return bots.map(bot => ({ ...bot, subscribed: false, wakeOn: [] }));
    const subscriptions = await repository.findSubscriptionsByConversation([key]);
    const byBot = new Map(subscriptions.map(row => [String(row.botUserId), row]));
    return bots.map(bot => {
        const row = byBot.get(String(bot.id));
        return { ...bot, subscribed: Boolean(row), wakeOn: row?.wakeOn || [] };
    });
}

/**
 * Wake-rule picker options: the organization's active compiled machines'
 * emitted types with their primary-region state paths.
 */
export async function listWakeOptions(auth) {
    assertBotManager(auth);
    return await processDefinitionsService.listActiveWorkflowStates(auth);
}

/**
 * The bot's request-shaped auth: same construction as the auth middleware
 * (pre-process context widened through resolveProcessAuth), so runtime
 * sends and tool calls hit identical access gates.
 */
export async function buildBotAuth(botUserId) {
    const bot = await usersService.getById(botUserId);
    if (!bot?.data?.bot) throw createError({ statusCode: 404, message: 'Bot not found' });
    const authContext = usersService.buildAuthContext(bot);
    // The bot's declared brain (a chat profile id): the runtime passes it
    // to the llm seam as an explicit profile override.
    authContext.botProfile = bot.data.bot.profile || '';
    if (bot.organizationId) {
        const org = await organizationsRepository.findById(bot.organizationId);
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

// --- Org assistant and member-visible contacts --------------------------------

const ASSISTANT_NAME = 'Assistant';
const assistantEmailFor = (organizationId) => `assistant-${organizationId}@bots.perigram.internal`;

/**
 * The org assistant (SPEC: agent access): every organization has one
 * default bot contact so chatting with an agent is as immediate as
 * starting a new chat — nobody creates anything first. Bootstrap is
 * idempotent per organization through the deterministic assistant address
 * (a 409 collision means it exists); process roles are assigned like any
 * member's, later, on the org team surface.
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

function contactRow(bot, subscription, assistantId) {
    const dto = bot.toJSON();
    const id = dto._id ?? dto.id;
    return {
        id,
        name: dto.identity?.name || '',
        avatarUrl: dto.data?.avatarUrl || null,
        assistant: String(id) === String(assistantId),
        subscribed: Boolean(subscription),
        profile: subscription?.profile || '',
        model: subscription?.model || '',
        // The bot's own brain (a chat profile id): the room's model select
        // falls back to it when no conversation pin exists.
        brain: dto.data?.bot?.profile || '',
        wakeOn: subscription?.wakeOn || []
    };
}

/**
 * Member-visible bot contacts (the chat pickers' AI section and the
 * per-conversation bot sheet): ensures the org assistant exists, lists
 * every org bot, and — when a conversation key is supplied and the caller
 * is admitted to it — decorates rows with the subscription flag and wake
 * rules. Administration (create/token/delete) stays on the manager-gated
 * routes; joining a bot to a room is participant-level.
 */
export async function listBotContacts(auth, conversationKey = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!auth.organizationId) return { assistantId: null, contacts: [] };
    const assistant = await ensureOrganizationAssistant(auth.organizationId);
    const members = await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
    const bots = (members || []).filter(member => member?.data?.bot);

    let subscriptions = [];
    const key = String(conversationKey || '').trim();
    if (key) {
        const context = await supportService.getConversationContextByKey(auth, key);
        subscriptions = await repository.findSubscriptionsByConversation([context.conversationKey]);
    }
    const byBot = new Map(subscriptions.map(row => [String(row.botUserId), row]));
    const chatProfiles = await llmService.chatProfiles(auth.organizationId);
    const chatModels = await llmService.chatModels(auth.organizationId);
    return {
        assistantId: assistant?.id || null,
        chatProfiles,
        chatModels,
        contacts: bots
            .map(bot => contactRow(bot, byBot.get(String(bot.id)), assistant?.id))
            .sort((a, b) => (b.assistant ? 1 : 0) - (a.assistant ? 1 : 0) || a.name.localeCompare(b.name))
    };
}
