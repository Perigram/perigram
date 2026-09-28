import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as directoryService from '../../features/directory/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  return await directoryService.search(auth, {
    q: query.q,
    types: query.types
  });
});
