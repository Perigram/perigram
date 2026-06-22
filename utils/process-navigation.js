import {
  actionToLevel,
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
    const requiredLevel = requirement.action ? actionToLevel(requirement.action, requirement.level || 'read') : requirement.level || 'read';
    return normalizePermissionGrants(permissions[requirement.feature]).some(grant => {
      if (!levelAtLeast(grant.level, requiredLevel)) return false;
      if (requirement.action && grant.actions && grant.actions[requirement.action] !== true) return false;
      return transitionRequirementMatchesGrant(requirement, grant);
    });
  }

  const requiredLevel = requirement.action ? actionToLevel(requirement.action, requirement.level || 'read') : requirement.level || 'read';
  return normalizePermissionGrants(permissions[requirement.feature]).some(grant => {
    if (!levelAtLeast(grant.level, requiredLevel)) return false;
    if (requirement.action && grant.actions && grant.actions[requirement.action] !== true) return false;
    if (!transitionRequirementMatchesGrant(requirement, grant)) return false;
    if (!requirementScopeMatchesGrant(requirement.scope, grant.scope || grant)) return false;
    return true;
  });
}

function firstTransition(requirement = {}) {
  const transition = requirement.transition || requirement.transitions;
  return Array.isArray(transition) ? transition[0] : transition;
}

function transitionRequirementMatchesGrant(requirement = {}, grant = {}) {
  const required = firstTransition(requirement);
  if (!required) return true;
  const allowed = grant.transitions || grant.transition;
  if (!allowed) return true;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.some(item => {
    if (typeof item === 'string') return item === required.to || item === `${required.from}->${required.to}`;
    return (!required.from || !item.from || item.from === required.from) && (!required.to || !item.to || item.to === required.to);
  });
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
