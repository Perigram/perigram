import * as connectionsService from '~/server/features/connections/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }

    const body = await readBody(event)
    const connectionId = body?.connectionId
    const requestedTopics = Array.isArray(body?.topics) ? body.topics : []
    if (!connectionId || typeof connectionId !== 'string') {
        setResponseStatus(event, 400)
        return { error: 'connectionId is required' }
    }

    const result = await connectionsService.syncTopics(connectionId, requestedTopics, auth)
    return { subscribed: result.subscribed }
})
