import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { actionToLevel, hasPermissionGrant } from './access-control.js';

/**
 * Role names are presets only. UI visibility resolves against decomposed
 * permission grants, the same shape used by backend access checks and
 * workbench test-access overrides.
 */
export const UI_PERMISSIONS = PERMISSION_TEMPLATES;

export function resolveUiPermission(role, feature, action, context = {}) {
  if (!feature || !action) return false;
  if (role === 'SuperAdmin') return true;

  const permissions = context.permissions || PERMISSION_TEMPLATES[role] || {};
  return hasPermissionGrant({
    permissions,
    feature,
    action,
    level: actionToLevel(action),
    entity: context.entity,
    entityType: context.entityType,
    transition: context.transition
  });
}
