import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId || !auth?.isAdmin) {
        setResponseStatus(401)
        return
    }

    const eventStream = createEventStream(event)
    const initialChatList = await supportService.listAdminSupportConversations(auth)

    let lastTimestamp = new Date(0)
    eventStream.push(
        JSON.stringify({
            type: 'initial',
            data: initialChatList
        })
    )

    if (initialChatList.length > 0) {
        lastTimestamp = Math.max(...initialChatList.map(chat => new Date(chat.timestamp).getTime()))
        lastTimestamp = new Date(lastTimestamp)
    }

    // Check for updates every second
    const interval = setInterval(async () => {
        try {
            const updatedChatList = await supportService.listAdminSupportConversations(auth)

            const hasNewMessages = updatedChatList.some(chat =>
                new Date(chat.timestamp) > lastTimestamp
            )

            if (hasNewMessages) {
                const newLastTimestamp = Math.max(...updatedChatList.map(chat =>
                    new Date(chat.timestamp).getTime()
                ))
                lastTimestamp = new Date(newLastTimestamp)

                await eventStream.push(
                    JSON.stringify({
                        type: 'update',
                        data: updatedChatList
                    })
                )
            }
        } catch (error) {
            console.error('Error checking for updates:', error)
        }
    }, 1000)

    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(async () => {
        await eventStream.push(
            JSON.stringify({
                type: 'heartbeat',
                ts: Date.now()
            })
        )
    }, 30000)

    // Clean up intervals when connection closes
    eventStream.onClosed(async () => {
        clearInterval(heartbeatInterval)
        clearInterval(interval)
        await eventStream.close()
    })

    return eventStream.send()
})
