import * as pagesService from '~/server/features/pages/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  const body = await readBody(event) || {};
  setResponseStatus(event, 201);
  return pagesService.create(body, auth);
});
