import { connectDB } from "~~/server/db/mongo";
import { getRegionState } from "~/server/core/blocks/index.js";

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
        .find({ 'lineage.project.entityId': project._id })
        .sort({ 'origin.timestamp': -1 })
        .toArray();

    const responseItems = await Promise.all(queues.map(async (queue) => {
        const selectedRevisionId = queue.status?.lifecycle?.data?.selectedRevisionId;
        if (!selectedRevisionId) return null;
        const selectedRevision = await db.collection('entity_revisions').findOne({ _id: selectedRevisionId });

        if (!selectedRevision) return null;

        const status = getRegionState(queue.status, 'nesting', 'IDLE');
        const isInProgress = status === 'RUNNING';
        
        // Find artifacts for this run
        const artifacts = await db.collection('artifacts')
            .find({
                'lineage.queue.entityId': queue._id?.toString?.() || queue._id,
                'lineage.queue.revisionId': selectedRevisionId
            })
            .toArray();

        const svgs = artifacts.filter(a => a.data?.type === 'LAYOUT_SVG').map(a => `/api/artifacts/${a._id}/content`);
        const dxfs = artifacts.filter(a => a.data?.type === 'LAYOUT_DXF').map(a => `/api/artifacts/${a._id}/content`);
        const results = selectedRevision.data?.snapshot?.results || {};

        return {
            id: queue._id,
            name: queue.identity?.name || `Queue #${queue.data?.queueNumber}`,
            status: status.toLowerCase(),
            createdAt: queue.origin?.timestamp,
            placed: results.placedCount || 0,
            requested: results.requested || 0,
            isInProgress,
            svgs,
            dxfs
        };
    }));

    return {
        items: responseItems.filter(Boolean),
    };
}
