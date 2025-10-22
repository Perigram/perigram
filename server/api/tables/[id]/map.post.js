import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';
import { tableSchema } from '~~/server/schemas/table.js';
import fs from 'fs';
import { ObjectId } from 'mongodb';

// A simple CSV parser
const parseCsv = (filePath) => {
    const content = fs.readFileSync(filePath, { encoding: 'utf8' });
    const lines = content.split('\n');
    const header = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        return header.reduce((obj, h, i) => {
            obj[h] = values[i];
            return obj;
        }, {});
    });
    return data;
};

const validateRow = (row, schema) => {
    for (const col of schema.columns) {
        if (col.required && !row[col.name]) {
            return `Missing required value for column: ${col.name}`;
        }
        if (row[col.name] && col.validation && !col.validation(row[col.name])) {
            return `Invalid value for column: ${col.name}`;
        }
    }
    return null;
};

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const tableId = event.context.params.id;
    const { mappings } = await readBody(event);

    const db = await connectDB();
    const table = await db.collection('tables').findOne({ _id: new ObjectId(tableId), ownerId: userId });

    if (!table) {
        throw createError({ statusCode: 404, message: 'Table not found' });
    }

    const rawData = parseCsv(table.rawFile.path);

    const processedData = [];
    const validationErrors = [];

    for (let i = 0; i < rawData.length; i++) {
        const rawRow = rawData[i];
        const processedRow = {};
        for (const key in mappings) {
            processedRow[key] = rawRow[mappings[key]];
        }

        const error = validateRow(processedRow, tableSchema);
        if (error) {
            validationErrors.push({ row: i + 2, error });
        } else {
            processedData.push(processedRow);
        }
    }

    if (validationErrors.length > 0) {
        await db.collection('tables').updateOne(
            { _id: new ObjectId(tableId) },
            { $set: { status: 'error', validationErrors } }
        );
        throw createError({ statusCode: 400, message: 'Validation failed', data: validationErrors });
    }

    await db.collection('tables').updateOne(
        { _id: new ObjectId(tableId) },
        { $set: { status: 'validated', data: processedData, columnMappings: mappings } }
    );

    // Clean up the raw file
    fs.unlinkSync(table.rawFile.path);

    return { status: 'validated' };
});