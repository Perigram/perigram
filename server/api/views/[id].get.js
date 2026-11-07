import * as viewsService from '~/server/features/views/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  return viewsService.getById(getRouterParam(event, 'id') || '', auth);
});
