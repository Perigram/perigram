import { defineEventHandler, getQuery } from 'h3';
import * as queuesService from '~/server/features/queues/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  const queues = await queuesService.list(
    {
      projectId: query.projectId,
      status: query.status,
      primaryStatus: query.primaryStatus,
      primaryStatuses: query.primaryStatuses
    },
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  const queueIds = queues.map(queue => queue._id);
  const [runPreview, sheetPreview] = await Promise.all([
    nestingRunsService.listPreviewByQueues(queueIds, auth.userId, auth.organizationId, auth.role, auth, { limit: 4 }),
    sheetsService.listPreviewByQueues(queueIds, auth.userId, auth.organizationId, auth.role, auth, { limit: 4 })
  ]);

  return queues.map(queue => {
    const queueId = queue._id?.toString?.() || queue._id;
    return {
      ...queue,
      summary: {
        ...(queue.summary || {}),
        runPreview: runPreview[queueId] || [],
        sheetPreview: sheetPreview[queueId] || []
      }
    };
  });
});
