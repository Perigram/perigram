import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const body = await readBody(event)
    // Agent run provenance (thinking, tool calls) is server-authored by the
    // bot runtime through the service seam — never client-postable.
    delete body.agent
    return await supportService.sendUserMessage(auth, body)
})
