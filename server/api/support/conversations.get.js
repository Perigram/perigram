import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const conversations = await supportService.listUserConversations(auth)
    return {
        data: conversations,
        // Nested rows are the same chats as their ancestors' composed
        // views: the shell badge counts root rows only.
        totalUnread: conversations
            .filter(item => !item.parentKey)
            .reduce((sum, item) => sum + Number(item.unreadCount || 0), 0)
    }
})
