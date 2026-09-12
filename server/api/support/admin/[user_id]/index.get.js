import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId || !auth?.isAdmin) {
        setResponseStatus(event, 401)
        return
    }

    const customerId = event.context.params.user_id
    const context = supportService.getAdminSupportContext(customerId)
    const messages = await supportService.listMessages(context.match)
    await supportService.markConversationRead(auth, { conversationKey: context.conversationKey })

    return {
        data: messages,
        currentUserId: auth.userId,
        conversation: {
            conversationKey: context.conversationKey,
            kind: context.kind
        }
    }
})
