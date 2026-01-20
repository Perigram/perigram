/**
 * Cassette Instances Service
 */
import * as repository from './repository.js';
import { createError } from 'h3';

export async function createFromQueue(queue, user) {
    const instances = [];
    
    for (const entry of queue.entries) {
        for (let i = 0; i < entry.quantity; i++) {
            instances.push({
                queueId: queue._id,
                projectSlug: queue.projectSlug,
                cassetteTemplateId: entry.cassetteTemplateId,
                dimensions: entry.dimensions,
                status: 'nested', // initial status after cut
                statusHistory: [{
                    status: 'nested',
                    timestamp: new Date(),
                    userId: user.userId,
                    note: 'Instance created from cut queue'
                }],
                instanceNumber: `${queue.queueNumber}-${instances.length + 1}`
            });
        }
    }
    
    if (instances.length > 0) {
        return await repository.insertMany(instances);
    }
    return { success: true, count: 0 };
}

export async function listByQueue(queueId, user) {
    // Basic access check could be added here
    return await repository.findByQueue(queueId);
}

export async function updateStatus(id, status, note, user) {
    const validStatuses = ['nested', 'manufactured', 'on-site', 'installed'];
    if (!validStatuses.includes(status)) {
        throw createError({ statusCode: 400, message: 'Invalid status' });
    }
    return await repository.updateStatus(id, status, note, user.userId);
}
