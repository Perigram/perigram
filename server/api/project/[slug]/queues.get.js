import { defineEventHandler, createError } from "h3";
import * as projectsService from "../../../features/projects/service.js";
import * as queuesService from "../../../features/queues/service.js";
import { requireAuth } from "../../../utils/permissions.js";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const slug = event.context.params.slug;

  // 1. Get project to get its ID from slug
  const project = await projectsService.getBySlug(
    slug,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  // 2. List queues for this project
  return await queuesService.listByProject(
    project._id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});