import * as pagesService from '~/server/features/pages/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  return pagesService.remove(getRouterParam(event, 'id') || '', auth);
});
