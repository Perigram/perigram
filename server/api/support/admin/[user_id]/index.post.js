import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId || !auth?.isAdmin) {
        setResponseStatus(401)
        return
    }

    const customerId = event.context.params.user_id
    const body = await readBody(event)
    return await supportService.sendAdminSupportMessage(auth, customerId, body)
})
