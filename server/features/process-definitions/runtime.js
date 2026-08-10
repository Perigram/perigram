import {
  compileProcessDefinition,
  resolveRoleAssignmentAccess,
  resolveEffectiveAccess,
  resolveNavigation,
  resolveScreens,
  resolveWorkflow
} from '~/packages/processes/src/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import * as repository from './repository.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { resolveOrganizationSystemScreens } from '../organizations/system-screens.js';
import { applyOwnerPermissionsToAuth } from '../users/organization-owner.js';

export async function getActiveProcessForOrganization(organizationId) {
  if (!organizationId) return null;
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw || null;
}

export async function getActiveCompiledProcess(organizationId) {
  const active = await getActiveProcessForOrganization(organizationId);
  const organization = organizationId
    ? await getAppRegistry().getEntityService('organization').getProcessConfiguration(organizationId)
    : null;
  return compileActiveProcessRuntime(active?.data || null, organization?.roles || {});
}

export function compileActiveProcessRuntime(data = null, roles = {}) {
  if (!data) return null;
  return compileProcessDefinition({ ...data, compiled: null }, cncDomain, { roles });
}

export async function resolveProcessAuth(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  const compiled = await getActiveCompiledProcess(organizationId);
  if (!compiled) {
    const ownerAuth = applyOwnerPermissionsToAuth(auth);
    const system = resolveOrganizationSystemScreens(ownerAuth);
    return {
      ...ownerAuth,
      navigation: system.navigation,
      screens: system.screens
    };
  }
  const userId = String(auth.userId || '');
  const organization = await getAppRegistry().getEntityService('organization').getProcessConfiguration(organizationId);
  const assignment = organization?.roleAssignments?.[userId] || null;
  const assignmentAccess = resolveRoleAssignmentAccess({ compiled, assignment, domain: cncDomain });
  const effectivePermissions = resolveEffectiveAccess({ access: assignmentAccess });
  const ownerAuth = applyOwnerPermissionsToAuth({ ...auth, effectivePermissions });
  const system = resolveOrganizationSystemScreens(ownerAuth);
  const processScreens = resolveScreens({ access: assignmentAccess });
  const processNavigation = resolveNavigation({ access: assignmentAccess });
  return {
    ...ownerAuth,
    process: {
      active: true,
      schemaVersion: compiled.schemaVersion,
      workflows: compiled.workflows || {},
      lineageBindings: compiled.lineageBindings || []
    },
    fieldPolicies: compiled.fieldPolicies || {},
    navigation: [...system.navigation, ...processNavigation],
    screens: [...system.screens, ...processScreens],
    roleAssignments: assignmentAccess
  };
}

export async function resolveProcessWorkflow({ organizationId, entityType, fallbackWorkflow = null } = {}) {
  const compiled = await getActiveCompiledProcess(organizationId);
  return resolveWorkflow({ compiled, entityType, fallbackWorkflow });
}

export async function resolveProcessCommandService({ organizationId, commandId } = {}) {
  const compiled = await getActiveCompiledProcess(organizationId);
  if (!compiled) return { processActive: false, gated: false, service: null };

  const commandServices = Object.values(compiled.services || {})
    .filter(service => service?.enabled && service.commandId);
  if (!commandServices.length) return { processActive: true, gated: false, service: null };

  const service = commandServices.find(item => item.commandId === commandId) || null;
  return {
    processActive: true,
    gated: true,
    service
  };
}
