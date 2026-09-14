import * as connectionsService from '~/server/features/connections/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }

    const eventStream = createEventStream(event)
    let connectionId = null

    const heartbeatInterval = setInterval(() => {
        eventStream.push(JSON.stringify({ type: 'heartbeat', ts: Date.now() })).catch(() => {})
    }, 30000)

    const registration = await connectionsService.registerConnection({
        auth,
        push: data => {
            eventStream.push(data).catch(() => {})
        }
    })
    connectionId = registration.id

    eventStream.push(
        JSON.stringify({
            type: 'ready',
            connectionId: registration.id,
            topics: registration.topics,
            presence: registration.presence
        })
    ).catch(() => {})

    eventStream.onClosed(async () => {
        clearInterval(heartbeatInterval)
        if (connectionId) await connectionsService.unregisterConnection(connectionId)
        await eventStream.close()
    })

    return eventStream.send()
})
