import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const eventStream = createEventStream(event)
    let lastSnapshot = ''

    const pushSnapshot = async (type = 'initial') => {
        const conversations = await supportService.listUserConversations(auth)
        const snapshot = JSON.stringify(conversations)
        if (type === 'initial' || snapshot !== lastSnapshot) {
            lastSnapshot = snapshot
            await eventStream.push(JSON.stringify({
                type,
                data: conversations,
                totalUnread: conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0)
            }))
        }
    }

    await pushSnapshot('initial')

    const interval = setInterval(async () => {
        await pushSnapshot('update')
    }, 1000)

    const heartbeatInterval = setInterval(async () => {
        await eventStream.push(JSON.stringify({ type: 'heartbeat', ts: Date.now() }))
    }, 30000)

    eventStream.onClosed(async () => {
        clearInterval(heartbeatInterval)
        clearInterval(interval)
        await eventStream.close()
    })

    return eventStream.send()
})
