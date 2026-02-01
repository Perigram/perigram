import { getById as getProjectById } from '../projects/service.js';
import { listByProject as listQueuesByProject } from '../queues/service.js';
import { list as listRuns } from '../nesting-runs/service.js';
import { list as listArtifacts } from '../artifacts/service.js';
import { createError } from 'h3';

/**
 * Results Service - v24 Absolute Final
 * Efficiently aggregates project-wide nesting results using Batch Lineage Retrieval.
 * No N+1 queries. Entities are standardized from the start.
 */

export async function getProjectResults(projectUid, userId, userOrg, userRole, userPermissions) {
  // 1. Get Project context (validates UID and permissions)
  const project = await getProjectById(projectUid);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  // 2. BATCH RETRIEVAL: Fetch all related entities in parallel using project UID in lineage
  // Note: We use projectUid as the lineage filter key
  const [queues, allRuns, allArtifacts] = await Promise.all([
    listQueuesByProject(projectUid, userId, userOrg, userRole, userPermissions),
    listRuns(userId, userOrg, userRole, userPermissions, { 'lineage.projectId': projectUid }),
    listArtifacts({ 'lineage.projectId': projectUid })
  ]);

  // 3. EFFICIENT IN-MEMORY ASSOCIATION
  // Maps for O(1) lookups
  const runsByQueue = allRuns.reduce((acc, run) => {
    const qUid = run.lineage?.queueId;
    if (!acc[qUid]) acc[qUid] = [];
    acc[qUid].push(run);
    return acc;
  }, {});

  const artifactsByRun = allArtifacts.reduce((acc, art) => {
    const rUid = art.lineage?.runId;
    if (!acc[rUid]) acc[rUid] = [];
    acc[rUid].push(art);
    return acc;
  }, {});

  // 4. ASSEMBLE COMPOSITION
  const items = queues.map(queue => {
    const queueRuns = runsByQueue[queue._id] || [];
    
    // Find latest run for this queue
    const latestRun = queueRuns.sort((a, b) => 
      new Date(b.origin?.timestamp || 0) - new Date(a.origin?.timestamp || 0)
    )[0];

    const runArtifacts = latestRun ? (artifactsByRun[latestRun._id] || []) : [];

    // Return the composition of standardized entities
    return {
      queue,
      latestRun: latestRun || null,
      artifacts: runArtifacts
    };
  });

  return {
    items
  };
}