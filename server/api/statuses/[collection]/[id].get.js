/**
 * GET /api/statuses/:collection/:id
 * Get status history for an entity from the centralized collection
 */

import { getStatusHistory } from '~/server/features/statuses/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  
  const { collection, id } = event.context.params;
  
  return await getStatusHistory(collection, id);
});
