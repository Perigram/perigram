import * as viewsService from '~/server/features/views/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  const typeId = getQuery(event)?.typeId || null;
  return { views: await viewsService.list(auth, { typeId }) };
});
