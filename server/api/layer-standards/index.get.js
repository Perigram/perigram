/**
 * GET /api/layer-standards
 * 
 * Get all layer standards (read-only, system-managed)
 * Optional query param: ?category=CONTOUR
 */

import { service } from '~/server/features/layer-standards';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const category = query.category;
  
  if (category) {
    return await service.getByCategory(category);
  }
  
  return await service.getAll();
});
