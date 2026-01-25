import { defineEventHandler, readBody } from "h3";
import * as projectsService from "~/server/features/projects/service";
import { requireAuth } from "~/server/utils/permissions";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const slug = event.context.params.slug;
  const body = await readBody(event);

  return await projectsService.update(
    slug,
    body,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});