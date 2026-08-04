export const ORGANIZATION_OWNER_PERMISSIONS = {
  organizations: { level: 'admin' },
  users: { level: 'admin' }
};

export function ownerMembership({ organizationId, status = 'active' } = {}) {
  return ensureOwnerMembership({
    organizationId,
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
