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
    const context = conversationKey.startsWith('group:')
        ? await supportService.getGroupConversationContext(auth, conversationKey.slice('group:'.length))
        : await supportService.getUserConversationContext(auth, query.recipientUserId || null)
    // `limit`/`before` drive lazy history: the newest page loads first and
    // older pages arrive keyed on the oldest loaded timestamp.
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100)
    const messages = await supportService.listMessages(context.match, {
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
            name: context.name || null
        }
    }
})
