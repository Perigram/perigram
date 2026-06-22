import {
  actionToLevel,
  hasPermissionGrant,
  levelAtLeast,
  normalizePermissionGrants
} from '~/shared/access-control';

export function resolveVisibleNavigation(navigation = [], permissions = {}) {
  return (navigation || []).filter(item => {
    const requirement = item.requires || {};
    return hasProcessRequirement({ permissions, requirement });
  });
}

export function resolveVisibleScreens(screens = [], permissions = {}) {
  return (screens || []).filter(screen => {
    const requirement = screen.required || screen.requires || {};
    return hasProcessRequirement({ permissions, requirement });
  });
}

export function hasProcessRequirement({ permissions = {}, requirement = {} } = {}) {
  if (!requirement.feature) return true;
  if (!requirement.scope) {
    return hasPermissionGrant({
      permissions,
      feature: requirement.feature,
      level: requirement.level || 'read',
      action: requirement.action || null,
      transition: firstTransition(requirement)
    });
  }

  const requiredLevel = requirement.action ? actionToLevel(requirement.action, requirement.level || 'read') : requirement.level || 'read';
  return normalizePermissionGrants(permissions[requirement.feature]).some(grant => {
    if (!levelAtLeast(grant.level, requiredLevel)) return false;
    if (requirement.action && grant.actions && grant.actions[requirement.action] !== true) return false;
    if (!requirementScopeMatchesGrant(requirement.scope, grant.scope || grant)) return false;
    return true;
  });
}

function firstTransition(requirement = {}) {
  const transition = requirement.transition || requirement.transitions;
  return Array.isArray(transition) ? transition[0] : transition;
}

function requirementScopeMatchesGrant(requiredScope = {}, grantScope = {}) {
  return Object.entries(requiredScope).every(([key, value]) => {
    if (value === undefined || value === null || value === '') return true;
    const grantValue = grantScope[key];
    const grantValues = grantScope[`${key}s`];
    if (grantValue === undefined && !Array.isArray(grantValues)) return true;
    const allowed = Array.isArray(grantValues) ? grantValues : [grantValue];
    return allowed.map(String).includes(String(value));
  });
}
