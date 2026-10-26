import { getQuery } from 'h3'
import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    const query = getQuery(event)
    const data = await supportService.searchConversationMessages(auth, {
        conversationKey: query.conversationKey,
        q: query.q,
        sender: query.sender,
        attachmentKind: query.attachmentKind,
        instanceType: query.instanceType,
        limit: query.limit
    })
    return { data }
})
