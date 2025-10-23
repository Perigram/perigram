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

    const { slug, tableId } = event.context.params

    const db = await connectDB()
    const tablesCollection = db.collection('tables')
    const projectsCollection = db.collection('projects')

    // Verify project ownership
    const project = await projectsCollection.findOne({ 
        slug,
        ownerId: userId 
    })

    if (!project) {
        throw createError({
            statusCode: 404,
            message: 'Project not found'
        })
    }

    // Delete table
    const result = await tablesCollection.deleteOne({
        _id: new ObjectId(tableId),
        projectSlug: slug
    })

    if (result.deletedCount === 0) {
        throw createError({
            statusCode: 404,
            message: 'Table not found'
        })
    }

    return {
        success: true,
        message: 'Table deleted successfully'
    }
})
