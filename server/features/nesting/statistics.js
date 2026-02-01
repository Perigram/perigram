import { connectDB } from '~~/server/db/mongo';

export async function updateProjectStatistics(projectSlug, nestingResult) {
    const db = await connectDB();
    const project = await db.collection('projects').findOne({ 'identity.slug': projectSlug });

    if (!project) {
        return;
    }

    const newSheetsUsed = nestingResult.sheets.length;
    const newAreaUsed = nestingResult.sheets.reduce((acc, sheet) => acc + (sheet.area || 0), 0);

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
