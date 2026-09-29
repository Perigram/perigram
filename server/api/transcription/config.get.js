import * as transcriptionService from '~/server/features/transcription/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    const available = await transcriptionService.isTranscriptionAvailable(auth.organizationId || null)
    return { available }
})
