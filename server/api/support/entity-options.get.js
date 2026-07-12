import { getQuery } from 'h3'
import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    const query = getQuery(event)
    return await supportService.listEntityOptions(
        auth,
        query.type?.toString?.() || '',
        query.q?.toString?.() || '',
        query.recipientUserId?.toString?.() || null
    )
})
