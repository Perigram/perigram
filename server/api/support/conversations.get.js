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
        // Leaf rows are the flat-view alternative, not extra chats: the
        // shell badge counts the top-level grouping only.
        totalUnread: conversations
            .filter(item => !item.isLeafRow)
            .reduce((sum, item) => sum + Number(item.unreadCount || 0), 0)
    }
})
