import { defineEventHandler } from "h3";
import * as projectsService from "~/server/features/projects/service";
import * as queuesService from "~/server/features/queues/service";
import { requireAuth } from "~/server/utils/permissions";

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
  
  const queues = await queuesService.listForUser(auth.userId); // This gets by ownerId. 
  // We might need a listByOrg in queuesService? 
  // For now listForUser (ownerId) is what we have.
  // If org-based, we might need to update queuesService to support org filtering too.
  
  const uiProjects = projects.map(p => {
      const count = queues.filter(q => q.projectSlug === p.slug).length;
      return {
          slug: p.slug,
          name: p.name,
          createdAt: p.createdAt,
          results: count
      };
  });

  return {
    projects: uiProjects,
    queueList: queues // minimal info
  };
});
