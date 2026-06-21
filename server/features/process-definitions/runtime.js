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
    navigation: resolveNavigation({ compiled, userId }),
    roleAssignments: compiled.userAccess?.[userId] || null
  };
}

export async function resolveProcessWorkflow({ organizationId, entityType, fallbackWorkflow = null } = {}) {
  const compiled = await getActiveCompiledProcess(organizationId);
  return resolveWorkflow({ compiled, entityType, fallbackWorkflow });
}
