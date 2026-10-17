import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const body = await readBody(event)
    // Agent run provenance and notice severities are server-authored by
    // the bot runtime through the service seam — never client-postable.
    delete body.agent
    delete body.notice
    return await supportService.sendUserMessage(auth, body)
})
