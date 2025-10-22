import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';
import { tableSchema } from '~~/server/schemas/table.js';
import multiparty from 'multiparty';
import fs from 'fs';

// A simple CSV header parser
const parseCsvHeader = (filePath) => {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        let header = '';
        let chunk = '';
        stream.on('data', (data) => {
            chunk += data;
            const lines = chunk.split('\n');
            if (lines.length > 1) {
                header = lines[0];
                stream.destroy();
            }
        });
        stream.on('close', () => resolve(header.split(',').map(h => h.trim())));
        stream.on('error', reject);
    });
};

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const projectSlug = event.context.params.slug;

    const form = new multiparty.Form();
    const { files } = await new Promise((resolve, reject) => {
        form.parse(event.req, (err, fields, files) => {
            if (err) reject(err);
            resolve({ fields, files });
        });
    });

    if (!files.file || files.file.length === 0) {
        throw createError({ statusCode: 400, message: 'No file uploaded.' });
    }

    const uploadedFile = files.file[0];
    const detectedHeaders = await parseCsvHeader(uploadedFile.path);

    const requiredHeaders = tableSchema.columns.map(c => c.name);
    const matchedHeaders = detectedHeaders.filter(h => requiredHeaders.includes(h));

    const db = await connectDB();
    const newTable = {
        projectId: projectSlug,
        ownerId: userId,
        name: uploadedFile.originalFilename,
        status: 'pending_mapping',
        createdAt: new Date(),
        rawFile: {
            path: uploadedFile.path,
            originalFilename: uploadedFile.originalFilename,
        },
        detectedHeaders,
        columnMappings: {},
        data: [],
    };

    const result = await db.collection('tables').insertOne(newTable);

    if (matchedHeaders.length === requiredHeaders.length) {
        // If all headers match, we could proceed to validation directly
        // For now, we'll keep it simple and always require mapping
    }

    return {
        status: 'needs_mapping',
        tableId: result.insertedId,
        detectedHeaders,
        requiredHeaders,
    };
});