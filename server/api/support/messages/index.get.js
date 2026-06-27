import { getQuery } from 'h3'
import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const eventStream = createEventStream(event)
    const query = getQuery(event)
    const context = await supportService.getUserConversationContext(auth, query.recipientUserId || null)
    const messages = await supportService.listMessages(context.match)

    let lastTimestamp = new Date(0)
    eventStream.push(
        JSON.stringify({
            type: 'initial',
            data: messages,
            currentUserId: auth.userId,
            conversation: {
                kind: context.kind,
                recipient: context.recipient
            }
        })
    )
    if (messages.length > 0) {
        lastTimestamp = messages[messages.length - 1].timestamp
    }
    const interval = setInterval(async () => {
        const newMessages = await supportService.listMessagesSince(context.match, lastTimestamp)
        if (newMessages.length > 0) {
            lastTimestamp = newMessages[newMessages.length - 1].timestamp
            await eventStream.push(
                JSON.stringify({
                    type: 'newMessages',
                    data: newMessages
                })
            )
        }
    }, 1000)

    const heartbeatInterval = setInterval(async () => {
        await eventStream.push(
            JSON.stringify({
                type: 'heartbeat',
                ts: Date.now()
            })
        )
    }, 30000)

    eventStream.onClosed(async () => {
        clearInterval(heartbeatInterval)
        clearInterval(interval)
        await eventStream.close()
    })

    return eventStream.send()
})
