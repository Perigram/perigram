import { defineEventHandler } from "h3";
import * as projectsService from "../../features/projects/service";
import { requireAuth } from "../../utils/permissions";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);

  // Use the list service to get projects visible to the user
  const projects = await projectsService.list(
    user.userId,
    user.organizationId,
    user.role,
    user
  );

  // Map to simple structure needed for dropdowns
  return projects.map(p => ({
    _id: p._id,
    name: p.name,
    slug: p.slug
  }));
});
