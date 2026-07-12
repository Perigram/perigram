import { defineEventHandler, readBody } from "h3";
import * as projectsService from "../../features/projects/service.js";
import { requireAuth } from "../../utils/permissions.js";
import { serializeForAccess } from "../../utils/entity-redaction.js";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const slug = event.context.params.slug;
  const body = await readBody(event);

  const project = await projectsService.update(
    slug,
    body,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  return serializeForAccess('project', project, auth);
});
