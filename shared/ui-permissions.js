import { actionToLevel, hasPermissionGrant } from '#shared/access-control.js';

export function resolveUiPermission(_role, feature, action, context = {}) {
  if (!feature || !action) return false;

  const permissions = context.permissions || {};
  return hasPermissionGrant({
    permissions,
    feature,
    action,
    level: actionToLevel(action),
    entity: context.entity,
    typeId: context.typeId,
    transition: context.transition,
    context
  });
}
