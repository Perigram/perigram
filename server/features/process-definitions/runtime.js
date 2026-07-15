import {
  compileProcessDefinition,
  resolveEffectiveAccess,
  resolveNavigation,
  resolveScreens,
  resolveWorkflow
} from '~/packages/processes/src/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import * as repository from './repository.js';
import { resolveOrganizationSystemScreens } from '../organizations/system-screens.js';
import { applyOwnerPermissionsToAuth } from '../users/organization-owner.js';

export async function getActiveProcessForOrganization(organizationId) {
  if (!organizationId) return null;
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw || null;
}

export async function getActiveCompiledProcess(organizationId) {
  const active = await getActiveProcessForOrganization(organizationId);
  return compiledProcessRuntime(active?.data || null);
}

function compiledProcessRuntime(data = null) {
  if (!data?.compiled) return null;
  if (!compiledRuntimeMissingActionContracts(data.compiled)) return data.compiled;
  return compileProcessDefinition({ ...data, compiled: null }, cncDomain);
}

function compiledRuntimeMissingActionContracts(compiled = {}) {
  return Object.values(compiled.actions || {}).some(action => !action.contracts) ||
    Object.values(compiled.userAccess || {}).some(access => (
      (access.actions || []).some(action => !action.contracts)
    ));
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
  const effectivePermissions = resolveEffectiveAccess({ compiled, userId });
  const ownerAuth = applyOwnerPermissionsToAuth({ ...auth, effectivePermissions });
  const system = resolveOrganizationSystemScreens(ownerAuth);
  const processScreens = resolveScreens({ compiled, userId });
  const processNavigation = resolveNavigation({ compiled, userId });
  return {
    ...ownerAuth,
    process: { active: true, schemaVersion: compiled.schemaVersion },
    fieldPolicies: compiled.fieldPolicies || {},
    navigation: [...system.navigation, ...processNavigation],
    screens: [...system.screens, ...processScreens],
    roleAssignments: compiled.userAccess?.[userId] || null
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
