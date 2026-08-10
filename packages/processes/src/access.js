import { compileAssignmentAccess, emptyAssignmentAccess } from './index.js';

export function resolveRoleAssignmentAccess({ compiled, assignment, domain = {} } = {}) {
  if (!assignment || (assignment.status && assignment.status !== 'active')) return emptyAssignmentAccess();
  return compileAssignmentAccess({ assignment, roles: compiled?.roles || {}, screens: compiled?.screens || {}, domain });
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

export function resolveWorkflow({ compiled, entityType, fallbackWorkflow = null } = {}) {
  return compiled?.workflows?.[entityType] || fallbackWorkflow;
}

export function resolveFieldPolicy({ compiled, entityType, basePolicy = null } = {}) {
  const processPolicy = compiled?.fieldPolicies?.[entityType];
  if (!processPolicy) return basePolicy;
  return {
    ...(basePolicy || {}),
    ...processPolicy
  };
}
