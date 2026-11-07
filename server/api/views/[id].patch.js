import * as viewsService from '~/server/features/views/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  const body = await readBody(event) || {};
  return viewsService.update(getRouterParam(event, 'id') || '', body, auth);
});
