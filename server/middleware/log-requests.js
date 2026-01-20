import { connectDB } from '../db/mongo'
import logger from '../utils/logger'

const SENSITIVE_KEY_REGEX = /(token|password|pass)/i

function filterSensitive(obj) {
    if (Array.isArray(obj)) {
        return obj.map(filterSensitive)
    } else if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => {
                if (typeof key === 'string' && SENSITIVE_KEY_REGEX.test(key)) {
                    return [key, '***']
                }
                return [key, filterSensitive(value)]
            })
        )
    }
    return obj
}

export default defineEventHandler(async (event) => {
    const { method, url, headers } = event.node.req
    const userAgent = headers['user-agent']
    const userId = event.context.auth?.userId
    const start = Date.now()
    const isSSE = headers.accept === 'text/event-stream'

    let requestBody = undefined
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
            // Using a more robust way to read body if it hasn't been read yet
            requestBody = await readBody(event).catch(() => undefined)
            if (requestBody) {
                requestBody = filterSensitive(requestBody)
            }
        } catch (e) {
            requestBody = '[unreadable]'
        }
    }

    // Simplified response logging without buffering bodies
    const originalEnd = event.node.res.end
    event.node.res.end = function (chunk, ...args) {
        const duration = Date.now() - start
        const statusCode = event.node.res.statusCode

        // Use a background task to avoid blocking the response
        connectDB().then(db => {
            db.collection('http').insertOne({
                method,
                url,
                isSSE,
                userAgent,
                userId,
                requestBody,
                statusCode,
                duration,
                timestamp: new Date()
            }).catch(err => console.error('Failed to log HTTP request to DB:', err))
        }).catch(err => console.error('Failed to connect to DB for logging:', err))

        return originalEnd.apply(this, [chunk, ...args])
    }
})