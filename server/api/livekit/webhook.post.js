import * as livekitService from '~/server/features/livekit/service.js'

export default defineEventHandler(async (event) => {
    const rawBody = await readRawBody(event)
    let body = {}
    try {
        body = JSON.parse(rawBody || '{}')
    } catch {
        body = {}
    }
    livekitService.verifyWebhookAuthorization(getHeader(event, 'authorization') || '', rawBody || '')
    return livekitService.publishWebhookEvent(body)
})
