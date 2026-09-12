import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId || !auth?.isAdmin) {
        setResponseStatus(event, 401)
        return
    }

    return { data: await supportService.listAdminSupportConversations(auth) }
})
