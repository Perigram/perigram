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
    const raw = p.toJSON ? p.toJSON() : p;
    const json = serializeForAccess('project', p, user);
    const projectId = raw._id?.toString?.() || raw._id;
    const safeJson = {
      ...json,
      _id: json._id || raw._id,
      identity: json.identity || raw.identity,
      origin: json.origin || raw.origin,
      status: json.status || raw.status,
      lineage: json.lineage || raw.lineage,
      data: {
        ...(json.data || {}),
        ...(raw.data?.address ? { address: raw.data.address } : {}),
        ...(raw.data?.thumbnailUrl ? { thumbnailUrl: raw.data.thumbnailUrl } : {})
      }
    };

    safeJson.summary = {
      ...(json.summary || raw.summary || {}),
      queueCount: json.summary?.queueCount || raw.summary?.queueCount || 0,
      queuePreview: queuePreviews[projectId] || []
    };
    return safeJson;
  });
});
