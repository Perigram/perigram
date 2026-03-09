import { defineEventHandler } from "h3";
import * as projectsService from "../../../features/projects/service.js";
import { requireAuth } from "../../../utils/permissions.js";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const slug = event.context.params.slug;

  const project = await projectsService.getBySlug(
    slug,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  return project?.toJSON();
});
