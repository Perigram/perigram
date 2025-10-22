import { connectDB } from '~~/server/db/mongo'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const cassetteId = event.context.params.id
    const db = await connectDB()

    const cassette = await db.collection('cassettes').findOne({
        _id: new ObjectId(cassetteId),
        userId
    })

    if (!cassette) {
        throw createError({
            statusCode: 404,
            message: 'Cassette not found'
        })
    }

    return cassette
})
