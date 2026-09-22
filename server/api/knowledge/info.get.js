import * as knowledgeService from '~/server/features/knowledge/service.js'

export default defineEventHandler((event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    return knowledgeService.describeService(auth)
})
