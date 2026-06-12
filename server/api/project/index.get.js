import { defineEventHandler } from "h3";
import * as projectsService from "../../features/projects/service.js";
import { requireAuth } from "../../utils/permissions.js";
import { serializeForAccess } from "../../utils/entity-redaction.js";

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);

  const projects = await projectsService.list(
    user.userId,
    user.organizationId,
    user.role,
    user
  );

  return projects.map(p => {
    const json = serializeForAccess('project', p, user);
    json.summary = { ...json.summary, queueCount: json.summary?.queueCount || 0 };
    return json;
  });
});
