import { connectDB } from '~~/server/db/mongo';

export async function updateProjectStatistics(projectSlug, nestingResult) {
    const db = await connectDB();
    const project = await db.collection('projects').findOne({ slug: projectSlug });

    if (!project) {
        // Or handle error appropriately
        return;
    }

    const newSheetsUsed = nestingResult.sheets.length;
    // This is a simplified calculation. A real implementation would be more complex.
    const newAreaUsed = nestingResult.sheets.reduce((acc, sheet) => acc + sheet.utilization, 0) * 100; // Assuming utilization is a percentage

    const totalSheetsUsed = (project.statistics?.sheetsUsed || 0) + newSheetsUsed;
    const totalAreaUsed = (project.statistics?.totalAreaUsed || 0) + newAreaUsed;
    // Again, a simplified overall utilization rate
    const averageUtilization = totalAreaUsed / totalSheetsUsed;

    await db.collection('projects').updateOne(
        { slug: projectSlug },
        {
            $set: {
                'statistics.sheetsUsed': totalSheetsUsed,
                'statistics.totalAreaUsed': totalAreaUsed,
                'statistics.utilizationRate': averageUtilization,
            }
        }
    );
}
