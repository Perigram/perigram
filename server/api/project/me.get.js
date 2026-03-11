import { defineEventHandler } from "h3";
import * as projectsService from "../../features/projects/service.js";
import { connectDB } from "../../db/mongo.js";
import { requireAuth } from "../../utils/permissions.js";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;

  const projects = await projectsService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  const db = await connectDB();
  const queueCounts = await db.collection('queues').aggregate([
    { $group: { _id: "$lineage.projectId", count: { $sum: 1 } } }
  ]).toArray();

  const countMap = Object.fromEntries(queueCounts.map(c => [c._id?.toString(), c.count]));
  
  const uiProjects = projects.map(p => {
      const json = p.toJSON();
      json.summary = { ...json.summary, queueCount: countMap[p.id] || 0 };
      return json;
  });

  return {
    projects: uiProjects
  };
});
