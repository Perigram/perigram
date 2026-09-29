import * as livekitService from '~/server/features/livekit/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    const body = await readBody(event)
    return await livekitService.stopRoomRecording(auth, String(body?.room || ''))
})
