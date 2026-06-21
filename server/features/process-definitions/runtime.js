import {
  resolveEffectiveAccess,
  resolveNavigation,
  resolveWorkflow
} from '~/packages/processes/src/index.js';
import * as repository from './repository.js';

export async function getActiveProcessForOrganization(organizationId) {
  if (!organizationId) return null;
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw || null;
}

export async function getActiveCompiledProcess(organizationId) {
  const active = await getActiveProcessForOrganization(organizationId);
  return active?.data?.compiled || null;
}

export async function resolveProcessAuth(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  const compiled = await getActiveCompiledProcess(organizationId);
  if (!compiled) return auth;
  const userId = String(auth.userId || '');
  return {
    ...auth,
    process: { active: true, schemaVersion: compiled.schemaVersion },
    effectivePermissions: resolveEffectiveAccess({ compiled, userId }),
    fieldPolicies: compiled.fieldPolicies || {},
    navigation: resolveNavigation({ compiled, userId }),
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
