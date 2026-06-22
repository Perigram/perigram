import { hasPermissionGrant } from '~/shared/access-control';

export function resolveVisibleNavigation(navigation = [], permissions = {}) {
  return (navigation || []).filter(item => {
    const requirement = item.requires || {};
    if (!requirement.feature) return true;
    return hasPermissionGrant({
      permissions,
      feature: requirement.feature,
      level: requirement.level || 'read',
      action: requirement.action || null
    });
  });
}

export function resolveVisibleScreens(screens = [], permissions = {}) {
  return (screens || []).filter(screen => {
    const requirement = screen.required || screen.requires || {};
    if (!requirement.feature) return true;
    return hasPermissionGrant({
      permissions,
      feature: requirement.feature,
      level: requirement.level || 'read',
      action: requirement.action || null
    });
  });
}
