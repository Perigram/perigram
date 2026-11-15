import { createError } from 'h3';

// The active organization for a request-scoped auth context: the active
// organization when set, else the first membership. Routes and services
// resolve tenancy through this one helper.
export function resolveOrganizationId(auth = {}) {
  if (!auth?.userId && auth?.system !== true) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  return organizationId;
}
