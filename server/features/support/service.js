import { createError } from 'h3';
import * as cassetteDesignsService from '~/server/features/cassette-designs/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as catalogsService from '~/server/features/catalogs/service.js';
import * as librariesService from '~/server/features/libraries/service.js';
import * as materialsService from '~/server/features/materials/service.js';
import * as materialPilesService from '~/server/features/material-piles/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as projectsService from '~/server/features/projects/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as remnantsService from '~/server/features/remnants/service.js';
import * as requisitionsService from '~/server/features/requisitions/service.js';
import * as sheetDesignsService from '~/server/features/sheet-designs/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import * as usersService from '~/server/features/users/service.js';
import * as warehousesService from '~/server/features/warehouses/service.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
import { actionToLevel, levelAtLeast, normalizePermissionGrants } from '#shared/access-control.js';
import * as repository from './repository.js';
import { MESSAGE_SENDER } from './const.js';

const ENTITY_REF_LIMIT = 6;
const ENTITY_OPTION_LIMIT = 20;
const scopedList = (service) => (auth, filters) => service.list(auth.userId, auth.organizationId, auth.role, auth, filters);
const ENTITY_OPTION_LOADERS = {
    cassette: scopedList(cassettesService),
    cassette_design: scopedList(cassetteDesignsService),
    catalog: scopedList(catalogsService),
    library: scopedList(librariesService),
    project: (auth, filters) => projectsService.list(auth.userId, auth.organizationId, auth.role, auth, filters),
    queue: (auth, filters) => queuesService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
    material_pile: scopedList(materialPilesService),
    nesting_run: scopedList(nestingRunsService),
    remnant: scopedList(remnantsService),
    requisition: (auth) => requisitionsService.list(auth.userId, auth.organizationId, auth.role, auth),
    sheet_design: scopedList(sheetDesignsService),
    sheet: (auth, filters) => sheetsService.list(auth.userId, auth.organizationId, auth.role, auth, filters),
    material: () => materialsService.list(),
    user: (auth) => usersService.list(auth.userId, auth.organizationId, auth.role, auth),
    warehouse: scopedList(warehousesService)
};

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

export async function listUserConversations(auth) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const messages = await repository.findConversationMessages(userConversationsMatch(userId), messageProjection());
    const conversations = await buildConversationSummaries(messages, auth);
    return await addReachableUserConversations(conversations, auth);
}

export async function listAdminSupportConversations(auth) {
    if (!auth?.userId || !auth?.isAdmin) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    const messages = await repository.findConversationMessages(adminSupportConversationsMatch(), messageProjection());
    return await buildConversationSummaries(messages, auth, { adminSupportOnly: true });
}

export async function markConversationRead(auth, body = {}) {
    const context = await getConversationContextByKey(auth, body.conversationKey || null);
    return await repository.markRead(context.conversationKey, auth.userId);
}

export async function listEntityOptions(auth, type, query = '', recipientUserId = null) {
    const scopedAuth = await resolveEntityOptionAuth(auth);
    if (!scopedAuth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const normalizedType = normalizeEntityOptionType(type);
    if (!isEntityOptionTypeAllowed(scopedAuth, normalizedType)) {
        throw createError({ statusCode: 400, message: 'Unsupported entity type' });
    }

    const normalizedQuery = query.toString().trim().toLowerCase();
    const entities = await loadEntityOptions(scopedAuth, normalizedType);
    const options = entities
        .map(entity => normalizeEntityOption(normalizedType, entity))
        .filter(option => option.value && matchesEntityQuery(option, normalizedQuery))
        .slice(0, ENTITY_OPTION_LIMIT);

    if (!recipientUserId || recipientUserId === scopedAuth.userId || normalizedType === 'user') return options;

    const recipientAuth = await resolveConversationParticipantAuth(scopedAuth, recipientUserId).catch(() => null);
    if (!recipientAuth) return options;

    const recipientIds = await listReadableEntityIds(recipientAuth, normalizedType);
    return options.map(option => ({
        ...option,
        recipientHasAccess: recipientIds.has(option.value)
    }));
}

export async function listEntityOptionTypes(auth = {}) {
    const scopedAuth = await resolveEntityOptionAuth(auth);
    return scopedEntityOptionTypes(scopedAuth).map(source => ({
        value: source.entityType,
        label: source.label || source.entityType,
        labelKey: source.labelKey || null,
        sourceId: source.id || null,
        screenKey: source.screenKey || null
    }));
}

export async function sendUserMessage(auth, body = {}) {
    const context = await getUserConversationContext(auth, body.recipientUserId || null);
    return await insertMessage({
        context,
        sender: MESSAGE_SENDER.USER,
        senderUserId: auth.userId,
        message: body.message,
        entityRefs: body.entityRefs,
        auth,
        recipientUserId: context.kind === 'direct' ? context.participants.find(participant => participant !== auth.userId) : null
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
        entityRefs: body.entityRefs,
        auth
    });
}

async function insertMessage({ context, sender, senderUserId, message, entityRefs, auth, recipientUserId = null }) {
    const text = normalizeMessage(message);
    const refs = await normalizeEntityRefs(entityRefs, auth, { recipientUserId });
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

async function normalizeEntityRefs(entityRefs = [], auth = {}, options = {}) {
    if (!Array.isArray(entityRefs)) return [];
    const scopedAuth = await resolveEntityOptionAuth(auth);
    const allowedTypes = new Set(scopedEntityOptionTypes(scopedAuth).map(source => source.entityType));
    const normalized = entityRefs
        .map(ref => ({
            type: normalizeEntityOptionType(ref?.type),
            id: ref?.id?.toString?.().trim?.() || '',
            label: typeof ref?.label === 'string' ? ref.label.trim() : ''
        }))
        .filter(ref => ref.type && ref.id)
        .slice(0, ENTITY_REF_LIMIT);

    const refs = [];
    for (const ref of normalized) {
        if (!allowedTypes.has(ref.type)) continue;
        const readableOptions = await listEntityOptions(scopedAuth, ref.type, ref.id, options.recipientUserId || null);
        const option = readableOptions.find(item => item.value?.toString?.() === ref.id || item.value === ref.id);
        if (option) {
            refs.push({
                type: ref.type,
                id: ref.id,
                label: option.label,
                entity: compactEntitySnapshot(ref.type, option.entity),
                chatOnlyForRecipient: option.recipientHasAccess === false
            });
        }
    }
    return refs;
}

async function buildConversationSummaries(messages, auth, options = {}) {
    const conversations = new Map();
    for (const message of messages) {
        const conversationKey = message.conversationKey || (message.userId ? supportConversationKey(message.userId) : null);
        if (!conversationKey) continue;
        if (options.adminSupportOnly && message.conversationKind === 'direct') continue;
        if (!conversations.has(conversationKey)) {
            conversations.set(conversationKey, {
                conversationKey,
                conversationKind: message.conversationKind || 'support',
                participants: normalizeParticipants(message),
                lastMessage: message.message,
                entityRefs: message.entityRefs || [],
                senderUserId: message.senderUserId,
                timestamp: message.timestamp,
                unreadCount: 0
            });
        }
    }

    const keys = Array.from(conversations.keys());
    const reads = await repository.findReadStates(auth.userId, keys);
    const readsByKey = new Map(reads.map(read => [read.conversationKey, read.lastReadAt]));
    for (const message of messages) {
        const conversationKey = message.conversationKey || (message.userId ? supportConversationKey(message.userId) : null);
        const summary = conversations.get(conversationKey);
        if (!summary || message.senderUserId === auth.userId) continue;
        const lastReadAt = readsByKey.get(conversationKey) || new Date(0);
        if (new Date(message.timestamp) > new Date(lastReadAt)) summary.unreadCount += 1;
    }

    const enriched = [];
    for (const summary of conversations.values()) {
        enriched.push({
            ...summary,
            userId: summary.conversationKind === 'support' ? summary.participants[0] : undefined,
            participant: await resolveConversationParticipant(summary, auth)
        });
    }
    return enriched.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
}

async function addReachableUserConversations(conversations, auth) {
    const byKey = new Map(conversations.map(conversation => [conversation.conversationKey, conversation]));
    const users = await usersService.list(auth.userId, auth.organizationId, auth.role, auth).catch(() => []);
    for (const user of users) {
        const dto = user?.toJSON ? user.toJSON() : user;
        const userId = dto?._id?.toString?.() || dto?._id || dto?.id;
        if (!userId || userId === auth.userId) continue;
        const conversationKey = directConversationKey(auth.userId, userId);
        if (byKey.has(conversationKey)) continue;
        byKey.set(conversationKey, {
            conversationKey,
            conversationKind: 'direct',
            participants: [auth.userId, userId].sort(),
            lastMessage: '',
            entityRefs: [],
            timestamp: null,
            unreadCount: 0,
            participant: dto
        });
    }
    return Array.from(byKey.values())
        .sort((left, right) => {
            if (!left.timestamp && !right.timestamp) return conversationLabel(left).localeCompare(conversationLabel(right));
            if (!left.timestamp) return 1;
            if (!right.timestamp) return -1;
            return new Date(right.timestamp) - new Date(left.timestamp);
        });
}

function normalizeParticipants(message) {
    if (Array.isArray(message.participants) && message.participants.length) {
        return message.participants.map(item => item?.toString?.() || item).filter(Boolean);
    }
    return message.userId ? [message.userId] : [];
}

async function resolveConversationParticipant(summary, auth) {
    if (summary.conversationKind === 'support') {
        if (summary.participants[0] && summary.participants[0] !== auth.userId) {
            const user = await usersService.getById(summary.participants[0]).catch(() => null);
            return user ? user.toJSON() : { _id: summary.participants[0], identity: { name: summary.participants[0] }, data: {} };
        }
        return { _id: 'support', identity: { name: 'Support' }, data: {} };
    }
    const otherUserId = summary.participants.find(participant => participant !== auth.userId);
    if (!otherUserId) return null;
    const user = await usersService.getById(otherUserId).catch(() => null);
    return user ? user.toJSON() : { _id: otherUserId, identity: { name: otherUserId }, data: {} };
}

async function getConversationContextByKey(auth, conversationKey) {
    if (!conversationKey) throw createError({ statusCode: 400, message: 'Conversation key is required' });
    if (conversationKey === supportConversationKey(auth.userId)) {
        return await getUserConversationContext(auth, null);
    }
    if (conversationKey.startsWith('direct:')) {
        const parts = conversationKey.split(':').slice(1);
        if (!parts.includes(auth.userId)) throw createError({ statusCode: 403, message: 'Forbidden' });
        const recipientUserId = parts.find(part => part !== auth.userId);
        return await getUserConversationContext(auth, recipientUserId);
    }
    if (auth.isAdmin && conversationKey.startsWith('support:')) {
        return getAdminSupportContext(conversationKey.slice('support:'.length));
    }
    throw createError({ statusCode: 403, message: 'Forbidden' });
}

function userConversationsMatch(userId) {
    return {
        $or: [
            { conversationKey: supportConversationKey(userId) },
            { userId, conversationKey: { $exists: false } },
            { conversationKind: 'direct', participants: userId }
        ]
    };
}

function adminSupportConversationsMatch() {
    return {
        sender: { $ne: MESSAGE_SENDER.WELCOME },
        conversationKind: { $ne: 'direct' }
    };
}

async function loadEntityOptions(auth, type) {
    const loader = ENTITY_OPTION_LOADERS[type];
    if (!loader) return [];

    if (auth.process?.active && type !== 'user') {
        const sources = scopedEntityOptionTypes(auth).filter(source => source.entityType === type);
        if (sources.length) return await loadEntityOptionsForSources(auth, type, sources);
    }

    return dedupeEntities(await loader(auth, {}));
}

async function loadEntityOptionsForSources(auth, type, sources = []) {
    const loader = ENTITY_OPTION_LOADERS[type];
    if (!loader || !sources.length) return [];

    const results = [];
    for (const source of sources) {
        const resolvedFilters = await resolveSourceFilters(auth, source);
        for (const filters of resolvedFilters) {
            results.push(...await loader(auth, filters));
        }
    }
    return dedupeEntities(results);
}

function normalizeEntityOption(type, entity) {
    const dto = entity?.toJSON ? entity.toJSON() : entity;
    const value = dto?._id?.toString?.() || dto?._id || dto?.id || '';
    const label = dto?.identity?.name || dto?.identity?.serial || dto?.identity?.uid || value;
    return {
        type,
        value,
        label,
        entity: dto
    };
}

function matchesEntityQuery(option, query) {
    if (!query) return true;
    return [option.label, option.value, option.entity?.identity?.uid, option.entity?.identity?.serial]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(query));
}

function normalizeEntityOptionType(type) {
    return typeof type === 'string' ? type.trim() : '';
}

function isEntityOptionTypeAllowed(auth = {}, type) {
    if (!type) return false;
    if (type === 'user') return true;
    return scopedEntityOptionSources(auth).some(source => source.entityType === type);
}

function scopedEntityOptionTypes(auth = {}) {
    return dedupeSources(scopedEntityOptionSources(auth));
}

function scopedEntityOptionSources(auth = {}) {
    if (auth.process?.active) {
        const sources = [];
        for (const screen of auth.screens || []) {
            for (const source of screen.sources || []) {
                if (!source?.entityType) continue;
                if (source.mode === 'single') continue;
                if (!sourceRequirementAllowed(auth, source.required || screen.required || {})) continue;
                sources.push({
                    ...source,
                    screenKey: screen.screenKey || screen.id || null,
                    screenEntityType: screen.entityType || null,
                    screenScope: screen.scope || null
                });
            }
        }
        return sources;
    }

    return Object.keys(ENTITY_OPTION_LOADERS)
        .filter(entityType => entityType !== 'user')
        .map(entityType => ({ entityType, label: entityType }));
}

function sourceRequirementAllowed(auth = {}, requirement = {}) {
    if (!requirement.feature) return true;
    const requiredLevel = requirement.action ? actionToLevel(requirement.action, requirement.level || 'read') : requirement.level || 'read';
    return normalizePermissionGrants((auth.effectivePermissions || {})[requirement.feature]).some(grant => {
        if (!levelAtLeast(grant.level, requiredLevel)) return false;
        if (requirement.action && grant.actions && grant.actions[requirement.action] !== true) return false;
        return sourceTransitionMatches(requirement, grant);
    });
}

function sourceTransitionMatches(requirement = {}, grant = {}) {
    const required = firstTransition(requirement);
    if (!required) return true;
    const allowed = grant.transitions || grant.transition;
    if (!allowed) return true;
    const list = Array.isArray(allowed) ? allowed : [allowed];
    return list.some(item => {
        if (typeof item === 'string') return item === required.to || item === `${required.from}->${required.to}`;
        return (!required.from || !item.from || item.from === required.from) && (!required.to || !item.to || item.to === required.to);
    });
}

function firstTransition(requirement = {}) {
    const transition = requirement.transition || requirement.transitions;
    return Array.isArray(transition) ? transition[0] : transition;
}

function dedupeSources(sources = []) {
    const byType = new Map();
    for (const source of sources) {
        if (!byType.has(source.entityType)) byType.set(source.entityType, source);
    }
    return [...byType.values()];
}

function sourceFilters(source = {}) {
    const filters = { ...(source.filters || {}) };
    const statuses = statusFiltersFromRequirement(source.required || {});
    if (statuses.length === 1) filters.primaryStatus = statuses[0];
    else if (statuses.length > 1) filters.primaryStatuses = statuses.join(',');
    return filters;
}

async function resolveSourceFilters(auth, source = {}) {
    const filters = sourceFilters(source);
    if (!hasUnresolvedScreenScope(filters)) return [filters];

    const directResolved = resolveFilterPlaceholders(filters, source.screenScope || {});
    if (!hasUnresolvedScreenScope(directResolved)) return [directResolved];

    const expanded = await expandParentScopedFilters(auth, directResolved, source);
    return expanded.filter(item => !hasUnresolvedScreenScope(item));
}

function resolveFilterPlaceholders(value, scope = {}) {
    if (Array.isArray(value)) return value.map(item => resolveFilterPlaceholders(item, scope));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFilterPlaceholders(item, scope)]));
    }
    if (value === '$screen.entityId' || value === '$screen.scope.entityId') {
        return resolveScopeEntityId(scope) || value;
    }
    return value;
}

async function expandParentScopedFilters(auth, filters = {}, source = {}) {
    const parentType = source.screenEntityType;
    if (!parentType) return [];

    const parentSources = scopedEntityOptionSources(auth).filter(item => item.entityType === parentType);
    if (!parentSources.length) return [];

    const parentEntities = await loadEntityOptionsForSources(auth, parentType, parentSources).catch(() => []);
    const parentIds = parentEntities
        .map(entity => {
            const dto = entity?.toJSON ? entity.toJSON() : entity;
            return dto?._id?.toString?.() || dto?._id || dto?.id || null;
        })
        .filter(Boolean);
    if (!parentIds.length) return [];

    const expansions = [];
    for (const parentId of parentIds) {
        const resolved = resolveFilterPlaceholders(filters, {
            ...(source.screenScope || {}),
            entityId: parentId
        });
        if (!hasUnresolvedScreenScope(resolved)) expansions.push(resolved);
    }
    return expansions;
}

function resolveScopeEntityId(scope = {}) {
    if (scope.entityId) return scope.entityId;
    for (const [key, value] of Object.entries(scope || {})) {
        if (key.endsWith('Id') && value) return value;
    }
    return null;
}

function statusFiltersFromRequirement(requirement = {}) {
    return [...new Set(statusesFromRule(requirement.rule))];
}

function statusesFromRule(rule) {
    if (!rule || typeof rule !== 'object') return [];
    if (Array.isArray(rule)) return rule.flatMap(statusesFromRule);
    if (Array.isArray(rule.any)) return rule.any.flatMap(statusesFromRule);
    if (Array.isArray(rule.all)) return rule.all.flatMap(statusesFromRule);
    if (rule.not) return [];
    if ((rule.fact === 'primaryStatus' || rule.fact === 'status.primary') && rule.equals) return [String(rule.equals)];
    if ((rule.fact === 'primaryStatus' || rule.fact === 'status.primary') && Array.isArray(rule.in)) return rule.in.map(String);
    return [];
}

function hasUnresolvedScreenScope(value) {
    if (Array.isArray(value)) return value.some(hasUnresolvedScreenScope);
    if (value && typeof value === 'object') return Object.values(value).some(hasUnresolvedScreenScope);
    return typeof value === 'string' && value.startsWith('$screen.');
}

function dedupeEntities(entities = []) {
    const byId = new Map();
    for (const entity of entities) {
        const dto = entity?.toJSON ? entity.toJSON() : entity;
        const id = dto?._id?.toString?.() || dto?._id || dto?.id;
        if (!id || byId.has(id)) continue;
        byId.set(id, entity);
    }
    return [...byId.values()];
}

async function listReadableEntityIds(auth, type) {
    const entities = await loadEntityOptions(auth, type).catch(() => []);
    return new Set(entities
        .map(entity => {
            const dto = entity?.toJSON ? entity.toJSON() : entity;
            return dto?._id?.toString?.() || dto?._id || dto?.id || null;
        })
        .filter(Boolean));
}

function compactEntitySnapshot(type, entity) {
    const dto = entity?.toJSON ? entity.toJSON() : entity;
    if (!dto || typeof dto !== 'object') return null;

    const snapshot = {
        _id: dto._id,
        identity: dto.identity || {},
        lineage: dto.lineage || {},
        origin: dto.origin || null,
        status: dto.status || null,
        specs: dto.specs || null,
        attachments: dto.attachments || {},
        summary: dto.summary || {}
    };
    const data = { ...(dto.data || {}) };

    if (type === 'nesting_run') {
        snapshot.data = pickDefined(data, ['results', 'materialPool', 'sheetDesignIds']);
        return snapshot;
    }

    if (type === 'library') {
        snapshot.data = pickDefined(data, ['material', 'description']);
        return snapshot;
    }

    if (type === 'cassette_design' || type === 'cassette' || type === 'sheet_design' || type === 'remnant') {
        snapshot.data = {
            ...pickDefined(data, ['materialPool', 'parameters', 'description', 'revisions', 'sheetDesignIds', 'results']),
            ...(data.geometry ? { geometry: compactGeometrySnapshot(data.geometry) } : {})
        };
        return snapshot;
    }

    delete data.layoutData;
    delete data.layerData;
    delete data.polygonParts;
    delete data.artifactIds;
    if (data.geometry) data.geometry = compactGeometrySnapshot(data.geometry);
    snapshot.data = data;
    return snapshot;
}

function compactGeometrySnapshot(geometry = {}) {
    const compact = pickDefined(geometry, ['preview', 'dxfId', 'dimensions', 'bounds']);
    return Object.keys(compact).length ? compact : undefined;
}

function pickDefined(source = {}, keys = []) {
    return keys.reduce((acc, key) => {
        if (source[key] !== undefined) acc[key] = source[key];
        return acc;
    }, {});
}

async function resolveConversationParticipantAuth(requesterAuth = {}, participantUserId = null) {
    if (!participantUserId || participantUserId === requesterAuth.userId) return requesterAuth;
    const context = await getUserConversationContext(requesterAuth, participantUserId);
    const recipient = context.recipient || (await usersService.getById(participantUserId))?.toJSON?.() || null;
    if (!recipient) throw createError({ statusCode: 404, message: 'User not found' });

    return await resolveProcessAuth({
        userId: recipient._id?.toString?.() || recipient._id || recipient.id,
        organizationId: recipient.lineage?.organizationId?.toString?.() || recipient.lineage?.organizationId || recipient.data?.memberships?.[0]?.organizationId || null,
        role: recipient.data?.role,
        permissions: recipient.data?.permissions || {},
        memberships: recipient.data?.memberships || [],
        restrictedTo: recipient.data?.restrictedTo || recipient.lineage?.restrictedTo || null
    });
}

async function resolveEntityOptionAuth(auth = {}) {
    if (!auth?.userId) return auth;
    if (auth.process?.active || Array.isArray(auth.screens) || auth.effectivePermissions) return auth;
    const resolved = await resolveProcessAuth(auth);
    if (resolved?.process?.active || Array.isArray(resolved?.screens) || resolved?.effectivePermissions) return resolved;
    return auth;
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

function directConversationKey(left, right) {
    return `direct:${[left, right].map(String).sort().join(':')}`;
}

function conversationLabel(conversation) {
    return conversation?.participant?.identity?.name || conversation?.participant?.name || conversation?.conversationKey || '';
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
        userId: 1,
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
