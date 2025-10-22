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

    const slug = event.context.params.slug
    const db = await connectDB()

    const project = await db.collection('projects').findOne({ slug, ownerId: userId })
    if (!project) {
        throw createError({
            statusCode: 404,
            message: 'Project not found'
        })
    }

    // Delete all files associated with the project
    await db.collection('user_dxf_files').deleteMany({ projectSlug: slug })
    
    // Delete all nesting jobs
    await db.collection('nesting_jobs').deleteMany({ projectSlug: slug })
    
    // Delete all tables
    await db.collection('tables').deleteMany({ projectId: project._id.toString() })
    
    // Delete the project
    await db.collection('projects').deleteOne({ slug, ownerId: userId })

    return { success: true }
})
