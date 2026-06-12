import { defineEventHandler } from "h3";
import * as projectsService from "../../features/projects/service.js";
import * as queuesService from "../../features/queues/service.js";
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
  const queuePreviews = await queuesService.listPreviewByProjects(
    projects.map(project => project._id),
    user.userId,
    user.organizationId,
    user.role,
    user,
    { limit: 5 }
  );

  return projects.map(p => {
    const json = serializeForAccess('project', p, user);
    const projectId = json._id?.toString?.() || json._id;
    json.summary = {
      ...json.summary,
      queueCount: json.summary?.queueCount || 0,
      queuePreview: queuePreviews[projectId] || []
    };
    return json;
  });
});
