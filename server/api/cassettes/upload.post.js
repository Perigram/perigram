import { connectDB } from '~~/server/db/mongo'
import { ObjectId } from 'mongodb'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId
    if (!userId) {
        throw createError({
            statusCode: 401,
            message: 'Unauthorized'
        })
    }

    const form = formidable({
        maxFileSize: 50 * 1024 * 1024, // 50MB
        keepExtensions: true,
    })

    const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(event.node.req, (err, fields, files) => {
            if (err) reject(err)
            else resolve([fields, files])
        })
    })

    const file = files.file?.[0]
    const name = fields.name?.[0] || 'Unnamed Cassette'

    if (!file) {
        throw createError({
            statusCode: 400,
            message: 'No file uploaded'
        })
    }

    const db = await connectDB()
    const cassetteBucket = db.bucket('cassettes')
    
    // Upload DXF to GridFS
    const dxfStream = fs.createReadStream(file.filepath)
    const dxfUpload = cassetteBucket.openUploadStream(file.originalFilename || 'cassette.dxf', {
        metadata: { userId }
    })
    
    await new Promise((resolve, reject) => {
        dxfStream.pipe(dxfUpload)
            .on('finish', resolve)
            .on('error', reject)
    })

    // Create cassette document
    const cassette = {
        name,
        userId,
        dxfId: dxfUpload.id.toString(),
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
    // For now, return mock detected layers
    cassette.detectedLayers = ['Layer 0', 'Cut', 'Bend', 'Frame']

    // Cleanup temp file
    fs.unlinkSync(file.filepath)

    return cassette
})
