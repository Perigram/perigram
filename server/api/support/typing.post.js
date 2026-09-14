import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }

    const body = await readBody(event)
    await supportService.notifyTyping(auth, body?.conversationKey || null)
    return { ok: true }
})
