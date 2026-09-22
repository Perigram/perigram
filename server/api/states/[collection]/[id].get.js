/**
 * GET /api/states/:collection/:id
 * Get status history for an entity from the centralized collection
 */

import { getStateHistory } from '~/server/features/states/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  
  const { collection, id } = event.context.params;
  
  return await getStateHistory(collection, id);
});
