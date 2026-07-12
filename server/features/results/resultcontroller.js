import { connectDB } from "~~/server/db/mongo";
import { ObjectId } from "mongodb";
import { getPrimaryState } from "~/server/core/blocks/index.js";

/**
 * @param {string} userId 
 * @param {string} projectSlug 
 * @returns {Promise<{items: {slug: string, status: string, createdAt: Date, svgs: string[]}[]}>}
 */
export async function getResults(userId, projectSlug) {
    const db = await connectDB();
    
    // 1. Find the project
    const project = await db.collection('projects').findOne({ 'identity.slug': projectSlug });
    if (!project) return { items: [] };

    // 2. Find all queues for this project
    const queues = await db.collection('queues')
        .find({ 'lineage.projectId': project._id })
        .sort({ 'origin.timestamp': -1 })
        .toArray();

    const responseItems = await Promise.all(queues.map(async (queue) => {
        // 3. Find latest run for this queue
        const latestRun = await db.collection('nesting_runs')
            .findOne({ 'lineage.queueId': queue._id }, { sort: { 'origin.timestamp': -1 } });

        if (!latestRun) return null;

        const status = getPrimaryState(latestRun.status, 'pending');
        const isInProgress = status === 'PROPOSED' || status === 'QUEUED';
        
        // Find artifacts for this run
        const artifacts = await db.collection('artifacts')
            .find({ 'lineage.runId': latestRun._id })
            .toArray();

        const svgs = artifacts.filter(a => a.data?.type === 'LAYOUT_SVG').map(a => `/api/artifacts/${a._id}`);
        const dxfs = artifacts.filter(a => a.data?.type === 'LAYOUT_DXF').map(a => `/api/artifacts/${a._id}`);

        return {
            id: queue._id,
            name: queue.identity?.name || `Queue #${queue.data?.queueNumber}`,
            status: status.toLowerCase(),
            createdAt: queue.origin?.timestamp,
            placed: latestRun.data?.results?.placed || 0,
            requested: latestRun.data?.results?.requested || 0,
            isInProgress,
            svgs,
            dxfs
        };
    }));

    return {
        items: responseItems.filter(Boolean),
    };
}
