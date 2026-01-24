/**
 * Cassette Instances Service
 */
import * as repository from './repository.js';
import { createError } from 'h3';
import { addStatus, initializeStatus } from '~/server/features/statuses/service';

export async function createFromQueue(queue, user) {
    const instances = [];
    
    for (const entry of queue.entries) {
        for (let i = 0; i < entry.quantity; i++) {
            instances.push({
                queueId: queue._id,
                projectSlug: queue.projectSlug,
                cassetteTemplateId: entry.cassetteTemplateId,
                cassetteDesignId: entry.cassetteDesignId, // NEW: link to design
                instanceNumber: `${queue.queueNumber}-${instances.length + 1}`,
                note: ''
            });
        }
    }
    
    if (instances.length > 0) {
        const result = await repository.insertMany(instances);
        
        // Initialize status for each instance
        if (result.insertedIds) {
            for (const id of Object.values(result.insertedIds)) {
                await initializeStatus('cassette_instances', id.toString(), user.userId, 'Instance created from cut queue');
            }
        }
        
        return result;
    }
    return { success: true, count: 0 };
}

export async function listByQueue(queueId, user) {
    return await repository.findByQueue(queueId);
}

export async function updateStatus(id, status, note, user) {
    // Use centralized Status Service
    return await addStatus('cassette_instances', id, status, user.userId, note);
}
