import { createError } from 'h3';
import * as usersService from '~/server/features/users/service.js';
import * as repository from './repository.js';
import { MESSAGE_SENDER } from './const.js';

const ENTITY_REF_LIMIT = 6;

export async function getUserConversationContext(auth, recipientUserId = null) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });

    if (!recipientUserId || recipientUserId === userId) {
        return {
            kind: 'support',
            conversationKey: supportConversationKey(userId),
            participants: [userId],
            match: legacySupportMatch(userId),
            recipient: null
        };
    }

    const recipient = await usersService.getById(recipientUserId);
    if (!recipient) throw createError({ statusCode: 404, message: 'User not found' });
    if (!auth.isAdmin && !sharesOrganization(auth, recipient)) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }

    const participants = [userId, recipientUserId].map(String).sort();
    return {
        kind: 'direct',
        conversationKey: `direct:${participants.join(':')}`,
        participants,
        match: { conversationKey: `direct:${participants.join(':')}` },
        recipient: recipient.toJSON()
    };
}

export function getAdminSupportContext(customerId) {
    return {
        kind: 'support',
        conversationKey: supportConversationKey(customerId),
        participants: [customerId],
        match: legacySupportMatch(customerId)
    };
}

export async function listMessages(match) {
    return await repository.find(match, messageProjection());
}

export async function listMessagesSince(match, timestamp) {
    return await repository.findSince(match, timestamp, messageProjection());
}

export async function sendUserMessage(auth, body = {}) {
    const context = await getUserConversationContext(auth, body.recipientUserId || null);
    return await insertMessage({
        context,
        sender: MESSAGE_SENDER.USER,
        senderUserId: auth.userId,
        message: body.message,
        entityRefs: body.entityRefs
    });
}

export async function sendAdminSupportMessage(auth, customerId, body = {}) {
    if (!auth?.userId || !auth?.isAdmin) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    return await insertMessage({
        context: getAdminSupportContext(customerId),
        sender: MESSAGE_SENDER.SUPPORT,
        senderUserId: auth.userId,
        message: body.message,
        entityRefs: body.entityRefs
    });
}

async function insertMessage({ context, sender, senderUserId, message, entityRefs }) {
    const text = normalizeMessage(message);
    const refs = normalizeEntityRefs(entityRefs);
    return await repository.insert({
        userId: context.kind === 'support' ? context.participants[0] : null,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        participants: context.participants,
        sender,
        senderUserId,
        message: text,
        entityRefs: refs,
        timestamp: new Date()
    }, messageProjection());
}

function normalizeMessage(message) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) throw createError({ statusCode: 400, message: 'Message is required' });
    return text;
}

function normalizeEntityRefs(entityRefs = []) {
    if (!Array.isArray(entityRefs)) return [];
    return entityRefs
        .map(ref => ({
            type: typeof ref?.type === 'string' ? ref.type.trim() : '',
            id: ref?.id?.toString?.().trim?.() || '',
            label: typeof ref?.label === 'string' ? ref.label.trim() : ''
        }))
        .filter(ref => ref.type && ref.id)
        .slice(0, ENTITY_REF_LIMIT);
}

function sharesOrganization(auth = {}, recipient) {
    const authOrgIds = new Set((auth.memberships || [])
        .map(membership => membership.organizationId?.toString?.() || membership.organizationId)
        .filter(Boolean));
    if (auth.organizationId) authOrgIds.add(auth.organizationId.toString());

    const recipientOrgIds = (recipient.memberships || recipient.data?.memberships || [])
        .map(membership => membership.organizationId?.toString?.() || membership.organizationId)
        .filter(Boolean);

    return recipientOrgIds.some(orgId => authOrgIds.has(orgId));
}

function supportConversationKey(userId) {
    return `support:${userId}`;
}

function legacySupportMatch(userId) {
    return {
        $or: [
            { conversationKey: supportConversationKey(userId) },
            { userId, conversationKey: { $exists: false } }
        ]
    };
}

function messageProjection() {
    return {
        message: 1,
        sender: 1,
        senderUserId: 1,
        timestamp: 1,
        _id: 1,
        conversationKey: 1,
        conversationKind: 1,
        participants: 1,
        entityRefs: 1
    };
}
