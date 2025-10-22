import { connectDB } from '~~/server/db/mongo'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const body = await readBody(event)
    const amount = body?.amount || 100

    const db = await connectDB()
    
    await db.collection('users').updateOne(
        { id: userId },
        { $inc: { balance: amount } }
    )

    return { success: true, added: amount }
})
