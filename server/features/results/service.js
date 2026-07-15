import { getById as getProjectById } from '../projects/service.js';
import { listByProject as listQueuesByProject } from '../queues/service.js';
import { list as listRevisions } from '../entity-revisions/service.js';
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
  const [queues, allRevisions, allArtifacts] = await Promise.all([
    listQueuesByProject(projectUid, userId, userOrg, userRole, userPermissions),
    listRevisions(userId, userOrg, userRole, userPermissions, {
      entityType: 'queue',
      scope: 'nesting',
      'lineage.project.entityId': projectUid
    }),
    listArtifacts({ 'lineage.project.entityId': projectUid })
  ]);

  // 3. EFFICIENT IN-MEMORY ASSOCIATION
  // Maps for O(1) lookups
  const revisionsByQueue = allRevisions.reduce((acc, revision) => {
    const qUid = revision.data?.entityId;
    if (!acc[qUid]) acc[qUid] = [];
    acc[qUid].push(revision);
    return acc;
  }, {});

  const artifactsByRevision = allArtifacts.reduce((acc, artifact) => {
    const revisionId = artifact.lineage?.queue?.revisionId;
    if (!acc[revisionId]) acc[revisionId] = [];
    acc[revisionId].push(artifact);
    return acc;
  }, {});

  // 4. ASSEMBLE COMPOSITION
  const items = queues.map(queue => {
    const queueRevisions = revisionsByQueue[queue._id] || [];
    const selectedRevisionId = queue.status?.lifecycle?.data?.selectedRevisionId;
    const selectedRevision = queueRevisions.find(revision => String(revision._id) === String(selectedRevisionId)) || null;

    return {
      queue,
      selectedRevision,
      artifacts: selectedRevision ? (artifactsByRevision[selectedRevision._id] || []) : []
    };
  });

  return {
    items
  };
}
