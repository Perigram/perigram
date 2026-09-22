import { proxyRequest } from 'h3'
import * as knowledgeService from '~/server/features/knowledge/service.js'

/**
 * Authenticated catch-all reverse proxy to the OpenKnowledge container.
 * Admission is checked per request (session cookie carries it), the
 * `/api/knowledge/proxy` prefix is stripped, and method, headers, body,
 * and query string are forwarded unchanged. OpenKnowledge serves its
 * assets with relative paths, so every proxied URL keeps the prefix.
 */
export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    knowledgeService.authorizeKnowledge(auth)
    const path = event.context.params?._ ?? ''
    const { search } = new URL(event.path, 'http://proxy.internal')
    return proxyRequest(event, knowledgeService.proxyTarget(`${path}${search}`))
})
