import { connectDB } from '~~/server/db/mongo'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const db = await connectDB()
    const cassettes = await db.collection('cassettes')
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray()

    return cassettes
})
