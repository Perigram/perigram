export const ORGANIZATION_OWNER_PERMISSIONS = {
  organizations: { level: 'admin' },
  users: { level: 'admin' }
};

export function ownerMembership({ organizationId, role = 'role_admin', roleIds = ['role_admin'], status = 'active' } = {}) {
  return ensureOwnerMembership({
    organizationId,
    role,
    roleIds,
    permissions: ORGANIZATION_OWNER_PERMISSIONS,
    status,
    owner: true
  });
}

export function isOwnerMembership(membership = {}) {
  return isActiveMembership(membership)
    && (membership.owner === true || hasTenantAdminPermissions(membership.permissions || {}));
}

export function ensureOwnerMembership(membership = {}) {
  if (!membership.owner) return membership;
  return {
    ...membership,
    role: membership.role || 'role_admin',
    roleIds: membership.roleIds?.length ? membership.roleIds : ['role_admin'],
    permissions: mergeOwnerPermissions(membership.permissions || {}),
    status: membership.status || 'active'
  };
}

export function mergeOwnerPermissions(permissions = {}) {
  return {
    ...permissions,
    ...ORGANIZATION_OWNER_PERMISSIONS
  };
}

export function applyOwnerPermissionsToAuth(auth = {}) {
  const activeOrgId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (!activeOrgId) return auth;
  const ownerMembership = (auth.memberships || []).find(membership =>
    isOwnerMembership(membership)
    && membership.organizationId?.toString?.() === activeOrgId.toString()
  );
  if (!ownerMembership && !hasTenantAdminPermissions(auth.permissions || {})) return auth;
  return {
    ...auth,
    permissions: mergeOwnerPermissions(auth.permissions || {}),
    effectivePermissions: mergeOwnerPermissions(auth.effectivePermissions || {})
  };
}

function isActiveMembership(membership = {}) {
  return !['pending', 'rejected'].includes(membership.status);
}

function hasTenantAdminPermissions(permissions = {}) {
  return accessLevel(permissions.organizations) === 'admin'
    && accessLevel(permissions.users) === 'admin';
}

function accessLevel(grant) {
  if (typeof grant === 'string') return grant;
  return grant?.level || '';
}
