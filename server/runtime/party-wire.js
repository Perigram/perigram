// §3 wire adapters for the framework party services (CTS SPEC §13
// readable principals): the process plane's party reads speak the stored
// §3 shape — identity slots plus the declared rows — never the legacy
// feature DTO blocks. One home for the translation and for the read
// gates; the feature routes keep their own shapes and permissions.
import { createError } from 'h3';
import * as usersService from '../features/users/service.js';
import * as organizationsService from '../features/organizations/service.js';
import { frameworkTypes } from '#packages/cts/src/index.js';

const versionById = new Map(frameworkTypes.map(type => [type.id, type.version]));

function wireSlots(typeId, model, extraFields = {}) {
  const json = model?.toJSON ? model.toJSON() : (model || {});
  const name = json.identity?.name ?? null;
  const extra = typeof extraFields === 'function' ? extraFields(json) : extraFields;
  return {
    _id: json._id ?? json.id ?? null,
    type: typeId,
    typeVersion: versionById.get(typeId) ?? 1,
    name,
    fields: { name, email: json.data?.email ?? null, ...extra }
  };
}

// The roles a user holds in the active organization — derived here from
// the organization's authoritative roleAssignments (the single assignment
// home; nothing is copied onto the user record). The declared `roles` row
// is what makes role-scoped domains and filters expressible over user
// data (SPEC §6 where-domains).
async function roleIdsByUser(organizationId) {
  if (!organizationId) return new Map();
  const organization = await organizationsService.getById(organizationId);
  const assignments = organization?.data?.roleAssignments || {};
  return new Map(Object.entries(assignments)
    .map(([userId, assignment]) => [String(userId), [...(assignment?.roleIds || [])]]));
}

function sharedOrganizationIds(auth = {}) {
  return new Set(
    [auth.organizationId, ...(auth.memberships || []).map(item => item.organizationId)]
      .filter(Boolean).map(String)
  );
}

function assertReadable({ modelTypeId, model, auth }) {
  const json = model?.toJSON ? model.toJSON() : (model || {});
  if (String(json._id ?? json.id ?? '') === String(auth.userId ?? '')) return;
  const organizationIds = sharedOrganizationIds(auth);
  const membershipIds = (json.data?.memberships || []).map(item => String(item.organizationId));
  if (membershipIds.some(id => organizationIds.has(id))) return;
  if (modelTypeId === 'organization' && organizationIds.has(String(json._id ?? json.id ?? ''))) return;
  throw createError({ statusCode: 403, message: 'Forbidden' });
}

// The process bindings (processList/processGetById shapes the runtime
// registry registers): scope through the feature services' own list
// queries, gate by-id reads on shared membership (self always readable),
// and project the §3 wire shape.
export const partyProcessBindings = {
  user: {
    list: async (filters, context = {}) => {
      const roles = await roleIdsByUser(context.organizationId);
      const users = await usersService.list(context.userId, context.organizationId, context.role, context);
      return users.map(user => wireSlots('user', user, json => ({
        roles: roles.get(String(json._id ?? json.id)) || [],
        bot: Boolean(json.data?.bot),
        avatarUrl: json.data?.avatarUrl ?? null
      })));
    },
    read: async (id, context = {}) => {
      const user = await usersService.getById(id);
      if (!user) return null;
      assertReadable({ modelTypeId: 'user', model: user, auth: context });
      const roles = await roleIdsByUser(context.organizationId);
      return wireSlots('user', user, json => ({
        roles: roles.get(String(json._id ?? json.id)) || [],
        bot: Boolean(json.data?.bot),
        avatarUrl: json.data?.avatarUrl ?? null
      }));
    }
  },
  organization: {
    list: async (filters, context = {}) => (
      (await organizationsService.list(context.userId, context.organizationId, context.role, context))
        .map(organization => wireSlots('organization', organization))
    ),
    read: async (id, context = {}) => {
      const organization = await organizationsService.getById(id);
      if (!organization) return null;
      assertReadable({ modelTypeId: 'organization', model: organization, auth: context });
      return wireSlots('organization', organization);
    }
  }
};
