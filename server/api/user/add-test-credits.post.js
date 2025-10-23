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

    const db = await connectDB()
    
    // Add 100 credits to user balance
    const result = await db.collection('users').findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $inc: { credits: 100 } },
        { returnDocument: 'after' }
    )

    if (!result) {
        throw createError({
            statusCode: 404,
            message: 'User not found'
        })
    }

    return {
        success: true,
        newBalance: result.credits
    }
})
