import { createError } from 'h3';
import * as usersService from '~/server/features/users/service.js';
import * as supportService from '~/server/features/support/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
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
        createdAt: dto.data?.bot?.createdAt || null
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
        return { type, state };
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

    // Conversation admission runs through the support context resolution —
    // the same check that authorizes SSE topics and message reads.
    const context = await supportService.getConversationContextByKey(auth, conversationKey);
    if (context.kind === 'direct') {
        throw createError({ statusCode: 400, message: 'Direct chats need no bot subscription' });
    }
    if (context.kind === 'group') {
        await supportService.addGroupParticipant(auth, context.groupId, botId);
    }
    await repository.upsertSubscription({
        botUserId: bot.id,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        organizationId: context.organizationId || auth.organizationId,
        ...(wakeOn ? { wakeOn } : {})
    });
    return { botId: bot.id, conversationKey: context.conversationKey, subscribed: true, ...(wakeOn ? { wakeOn } : {}) };
}

export async function unsubscribeBot(auth, body = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const conversationKey = String(body?.conversationKey || '').trim();
    const botId = String(body?.botId || '').trim();
    if (!conversationKey || !botId) throw createError({ statusCode: 400, message: 'botId and conversationKey are required' });
    const context = await supportService.getConversationContextByKey(auth, conversationKey);
    if (context.kind === 'group') {
        await supportService.removeGroupParticipant(auth, context.groupId, botId);
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
