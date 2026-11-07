import * as viewsService from '~/server/features/views/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  const body = await readBody(event) || {};
  setResponseStatus(event, 201);
  return viewsService.create(body, auth);
});
