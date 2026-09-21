import { getQuery } from 'h3'
import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }

    const query = getQuery(event)
    const conversationKey = String(query.conversationKey || '')
    // Entity threads arrive as `entity=<type>:<id>` with an includeChildren
    // toggle: the narrow view reads the entity's own key, the composed view
    // matches any message whose entityPath contains the entity.
    const context = query.entity
        ? await supportService.getEntityConversationContext(auth, `entity:${query.entity}`)
        : conversationKey.startsWith('group:')
            ? await supportService.getGroupConversationContext(auth, conversationKey.slice('group:'.length))
            : await supportService.getUserConversationContext(auth, query.recipientUserId || null)
    const match = query.entity
        ? supportService.entityConversationMatch(context, query.includeChildren !== '0' && query.includeChildren !== 'false')
        : context.match
    // `limit`/`before` drive lazy history: the newest page loads first and
    // older pages arrive keyed on the oldest loaded timestamp.
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100)
    const messages = await supportService.listMessages(match, {
        limit,
        before: query.before || null
    })
    await supportService.markConversationRead(auth, { conversationKey: context.conversationKey })

    return {
        data: messages,
        hasMore: messages.length >= limit,
        currentUserId: auth.userId,
        conversation: {
            conversationKey: context.conversationKey,
            kind: context.kind,
            recipient: context.recipient,
            name: context.name || context.entityName || null,
            ...(context.kind === 'entity' ? {
                typeId: context.typeId,
                entityId: context.entityId
            } : {})
        }
    }
})
