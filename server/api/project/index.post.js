import { defineEventHandler, readBody } from "h3";
import * as projectsService from "~/server/features/projects/service";
import { requireAuth } from "~/server/utils/permissions";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const body = await readBody(event);

  return await projectsService.create(
    body || {},
    auth.userId,
    auth.organizationId,
    auth.permissions
  );
});
