import { connectDB } from '~~/server/db/mongo'
import { readMultipartFormData } from 'h3'
import { generateRandomString } from '~~/server/utils/strings'
import standardSlugify from 'standard-slugify'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const fields = await readMultipartFormData(event)
    
    const fileField = fields.find(f => f.name === 'file')
    const nameField = fields.find(f => f.name === 'name')
    
    if (!fileField) {
        throw createError({
            statusCode: 400,
            message: 'No file uploaded'
        })
    }

    const name = nameField?.data?.toString() || 'Unnamed Cassette'
    const fileName = fileField.filename || 'cassette.dxf'
    const fileBuffer = fileField.data
    
    const slug = standardSlugify(fileName, { keepCase: false }) + `-${generateRandomString(6)}.dxf`

    const db = await connectDB()
    const { GridFSBucket } = await import('mongodb')
    const cassetteBucket = new GridFSBucket(db, { bucketName: 'cassettes' })
    
    // Upload DXF to GridFS
    const uploadStream = cassetteBucket.openUploadStream(slug, {
        metadata: { userId }
    })
    
    await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve)
        uploadStream.on('error', reject)
        uploadStream.write(fileBuffer)
        uploadStream.end()
    })

    // Create cassette document
    const cassette = {
        slug,
        name,
        userId,
        dxfId: uploadStream.id.toString(),
        svgId: null,
        layerMapping: {
            cut: [],
            bend: [],
            frame: [],
            dimensions: []
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        processingStatus: 'pending'
    }

    const result = await db.collection('cassettes').insertOne(cassette)
    cassette._id = result.insertedId.toString()

    // TODO: Trigger worker to process DXF and detect layers
    cassette.detectedLayers = ['Layer 0', 'Cut', 'Bend', 'Frame']

    return cassette
})
