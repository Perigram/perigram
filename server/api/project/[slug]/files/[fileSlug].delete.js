import { connectDB } from '~~/server/db/mongo'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const slug = event.context.params.slug
    const fileSlug = event.context.params.fileSlug
    const db = await connectDB()

    const project = await db.collection('projects').findOne({ slug, ownerId: userId })
    if (!project) {
        throw createError({
            statusCode: 404,
            message: 'Project not found'
        })
    }

    const result = await db.collection('user_dxf_files').deleteOne({ 
        slug: fileSlug, 
        projectSlug: slug 
    })

    if (result.deletedCount === 0) {
        throw createError({
            statusCode: 404,
            message: 'File not found'
        })
    }

    return { success: true }
})
