import {
  compileProcessDefinition,
  migrateProducerOutputIdentities,
  resolveRoleAssignmentAccess,
  resolveEffectiveAccess,
  resolveNavigation,
  resolveScreens
} from '~/packages/processes/src/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { projectDomainFromView } from '~/packages/cts/src/index.js';
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
  // A stored active process that no longer compiles (types removed from the
  // registry view after the pack cutover) must not brick auth hydration:
  // degrade to "no active process" with a loud log — the organization
  // re-activates a process authored against the current view.
  try {
    return compileActiveProcessRuntime(active?.data || null, organization?.roles || {}, organizationId);
  } catch (error) {
    console.warn(`[process-definitions] active process for ${organizationId} no longer compiles and was bypassed: ${error?.message || error}`);
    return null;
  }
}

// The active runtime compiles through the CTS-projected domain so authored
// organization types are live in every compiled contract.
export async function compileActiveProcessRuntime(data = null, roles = {}, organizationId = null) {
  if (!data) return null;
  const registry = await compileRegistryForOrganization(organizationId);
  const domain = projectDomainFromView(registry, organizationId, cncDomain);
  const migration = migrateProducerOutputIdentities(data, domain);
  if (migration.errors.length) throw new Error(migration.errors.join('; '));
  return compileProcessDefinition({ ...migration.data, compiled: null }, domain, { roles });
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
      producerOutputs: compiled.producerOutputs || {},
      lineageBindings: compiled.lineageBindings || []
    },
    navigation: [...system.navigation, ...processNavigation],
    screens: [...system.screens, ...processScreens],
    roleAssignments: assignmentAccess
  };
}

export async function resolveProcessWorkflow({ organizationId, producerOutputId, entityType, fallbackWorkflow = null } = {}) {
  const compiled = await getActiveCompiledProcess(organizationId);
  return resolveCompiledProducerOutputWorkflow({ compiled, producerOutputId, entityType, fallbackWorkflow });
}

export function resolveCompiledProducerOutputWorkflow({ compiled, producerOutputId, entityType, fallbackWorkflow = null } = {}) {
  if (!compiled || !Object.keys(compiled.producerOutputs || {}).length) return fallbackWorkflow;
  if (!producerOutputId) throw new Error('producerOutputId is required to resolve a process workflow');
  const output = compiled.producerOutputs?.[producerOutputId];
  if (!output) throw new Error(`Unknown producerOutputId ${producerOutputId}`);
  if (entityType && output.entityType !== entityType) {
    throw new Error(`producerOutputId ${producerOutputId} emits ${output.entityType}, not ${entityType}`);
  }
  return output.workflow || fallbackWorkflow;
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
