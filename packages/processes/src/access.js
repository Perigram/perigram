import { emptyAssignmentAccess } from './compiler-core.js';
import { compileAssignmentAccess } from './access-compilation.js';

export function resolveRoleAssignmentAccess({ compiled, assignment, domain = {} } = {}) {
  if (!assignment || (assignment.status && assignment.status !== 'active')) return emptyAssignmentAccess();
  return compileAssignmentAccess({
    assignment,
    roles: compiled?.roles || {},
    screens: compiled?.screens || {},
    actions: compiled?.actions || {},
    lineageBindings: compiled?.lineageBindings || [],
    domain
  });
}

export function resolveEffectiveAccess({ access } = {}) {
  return access?.permissions || {};
}

export function resolveNavigation({ access } = {}) {
  return access?.navigation || [];
}

export function resolveScreens({ access } = {}) {
  return access?.screens || [];
}

