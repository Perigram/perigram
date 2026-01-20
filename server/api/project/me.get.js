import { defineEventHandler } from "h3";
import * as projectsService from "../../features/projects/service";
import { connectDB } from "../../db/mongo";
import { requireAuth } from "../../utils/permissions";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;

  const projects = await projectsService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );

  // For compatibility with dashboard (if it needs 'results' count)
  // We can fetch all queues for the user/org to count them map them
  // Or just return projects and update frontend.
  // Let's try to be backward compatible for now.
  
  const db = await connectDB();
  const queueCounts = await db.collection('queues').aggregate([
    { $match: { ownerId: auth.userId } },
    { $group: { _id: "$projectSlug", count: { $sum: 1 } } }
  ]).toArray();

  const countMap = Object.fromEntries(queueCounts.map(c => [c._id, c.count]));
  
  const uiProjects = projects.map(p => {
      return {
          slug: p.slug,
          name: p.name,
          createdAt: p.createdAt,
          results: countMap[p.slug] || 0
      };
  });

  return {
    projects: uiProjects
  };
});
