import { connectDB } from '../../db/mongo.js';

export async function updateProjectStatistics(projectSlug, nestingResult) {
    const db = await connectDB();
    const project = await db.collection('projects').findOne({ 'identity.slug': projectSlug });

    if (!project) {
        return;
    }

    const { sheetsUsed: newSheetsUsed, totalAreaUsed: newAreaUsed } = getNestingStatisticsDelta(nestingResult);

    const summary = project.data?.summary || {};
    const totalSheetsUsed = (summary.sheetsUsed || 0) + newSheetsUsed;
    const totalAreaUsed = (summary.totalAreaUsed || 0) + newAreaUsed;
    
    await db.collection('projects').updateOne(
        { 'identity.slug': projectSlug },
        {
            $set: {
                'data.summary.sheetsUsed': totalSheetsUsed,
                'data.summary.totalAreaUsed': totalAreaUsed,
                'data.summary.updatedAt': new Date()
            }
        }
    );
}

export function getNestingStatisticsDelta(nestingResult = {}) {
    const legacySheets = Array.isArray(nestingResult.sheets) ? nestingResult.sheets : null;
    if (legacySheets) {
        return {
            sheetsUsed: legacySheets.length,
            totalAreaUsed: legacySheets.reduce((acc, sheet) => acc + Number(sheet.area || 0), 0)
        };
    }

    const layouts = nestingResult.result?.solution?.layouts
        || nestingResult.result?.layouts
        || nestingResult.solution?.layouts
        || nestingResult.layouts
        || [];

    return {
        sheetsUsed: Array.isArray(layouts) ? layouts.length : 0,
        totalAreaUsed: Array.isArray(layouts)
            ? layouts.reduce((acc, layout) => acc + Number(layout.area || layout.sheetArea || 0), 0)
            : 0
    };
}
