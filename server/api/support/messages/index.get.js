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
    const messages = await supportService.listMessages(context.match)
    await supportService.markConversationRead(auth, { conversationKey: context.conversationKey })

    return {
        data: messages,
        currentUserId: auth.userId,
        conversation: {
            conversationKey: context.conversationKey,
            kind: context.kind,
            recipient: context.recipient,
            name: context.name || null
        }
    }
})
