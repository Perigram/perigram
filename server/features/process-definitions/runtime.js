import {
  compileProcessDefinition,
  migrateProducerOutputIdentities,
  resolveRoleAssignmentAccess,
  resolveEffectiveAccess,
  resolveNavigation,
  resolveScreens
} from '~/packages/processes/src/index.js';
import { cncDomain, cncPackContent } from '~/packages/domain-cnc/src/index.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { compileClientBundle, projectDomainFromView } from '~/packages/cts/src/index.js';
import { projectManifestAction, projectUiAction, projectUiScreen } from '~/packages/processes/src/ui-contract-projection.js';
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
    ? await getAppRegistry().getInstanceService('organization').getProcessConfiguration(organizationId)
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

// The projected domain for one organization — the single source the
// compiler, the designer, and assignment resolution consume. Legacy
// entity tables on the pack domain are not projected (SPEC §19).
async function getProjectedDomainFor(organizationId) {
  const registry = await compileRegistryForOrganization(organizationId);
  return projectDomainFromView(registry, organizationId, cncDomain, {
    packServices: cncPackContent.services
  });
}

// The active runtime compiles through the CTS-projected domain so authored
// organization types are live in every compiled contract. The CTS client
// bundle is emitted beside the UI contract so renderers never consult the
// registry directly.
export async function compileActiveProcessRuntime(data = null, roles = {}, organizationId = null) {
  if (!data) return null;
  const domain = await getProjectedDomainFor(organizationId);
  // The single lowering seam (SPEC §20): active processes authored in the
  // v5 species vocabulary lower to the executable working shapes here —
  // hydration compiles the same accepted form validate/activate do.
  // Without this, v5 cts.* records contribute no grants or screens to
  // the hydrated access contract.
  const { currentProcessDefinition } = await import('./compiler-adapter.js');
  const accepted = currentProcessDefinition(data, domain);
  const migration = migrateProducerOutputIdentities(accepted, domain);
  if (migration.errors.length) throw new Error(migration.errors.join('; '));
  const compiled = compileProcessDefinition({ ...migration.data, compiled: null }, domain, { roles });
  if (compiled) {
    const registry = await compileRegistryForOrganization(organizationId);
    compiled.bundle = compileClientBundle(registry, organizationId);
  }
  return compiled;
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
  const organization = await getAppRegistry().getInstanceService('organization').getProcessConfiguration(organizationId);
  const assignment = organization?.roleAssignments?.[userId] || null;
  // Assignment resolution reads the projected view — the same single
  // source the compiler consumed (legacy tables are not projected).
  const domain = await getProjectedDomainFor(organizationId);
  const assignmentAccess = resolveRoleAssignmentAccess({ compiled, assignment, domain });
  const effectivePermissions = resolveEffectiveAccess({ access: assignmentAccess });
  const ownerAuth = applyOwnerPermissionsToAuth({ ...auth, effectivePermissions });
  const system = resolveOrganizationSystemScreens(ownerAuth);
  const processScreens = resolveScreens({ access: assignmentAccess });
  const processNavigation = resolveNavigation({ access: assignmentAccess });
  // The wire speaks ONE vocabulary: every screen and manifest action the
  // browser reads is projected here (typeId, id, typeList/instanceDetail/
  // home, lineage bindings keyed childTypeId/parentTypeId). The compiled
  // execution channel keeps its internal names server-side; nothing with
  // `typeId`/`actionId` keys crosses hydration.
  const typeLabels = new Map((compiled.bundle?.types || []).map(type => [type.id, type.render?.label || type.id]));
  const manifestActions = (assignmentAccess.actions || [])
    .map(action => projectManifestAction(action, { typeLabels }))
    .filter(Boolean);
  return {
    ...ownerAuth,
    process: {
      active: true,
      schemaVersion: compiled.schemaVersion,
      producerOutputs: compiled.producerOutputs || {},
      lineageBindings: (compiled.lineageBindings || []).map(({ childTypeId, parentTypeId, ...binding }) => ({
        ...binding,
        childTypeId: childTypeId,
        parentTypeId: parentTypeId
      })),
      // The UI generator's inputs ride with the hydration payload: the CTS
      // client bundle and the projected action contract, so the screens
      // renderer never consults the registry or the execution channel.
      bundle: compiled.bundle || { types: [] },
      actions: Object.fromEntries(Object.values(compiled.actions || {})
        .map(action => [action.id, projectUiAction(action, { typeLabels })])
        .filter(([, projected]) => projected))
    },
    navigation: [...system.navigation, ...processNavigation],
    screens: [...system.screens, ...processScreens].map(screen => projectUiScreen(screen)),
    roleAssignments: { ...assignmentAccess, actions: manifestActions }
  };
}

export async function resolveProcessWorkflow({ organizationId, producerOutputId, typeId, fallbackWorkflow = null } = {}) {
  const compiled = await getActiveCompiledProcess(organizationId);
  return resolveCompiledProducerOutputWorkflow({ compiled, producerOutputId, typeId, fallbackWorkflow });
}

export function resolveCompiledProducerOutputWorkflow({ compiled, producerOutputId, typeId, fallbackWorkflow = null } = {}) {
  if (!compiled || !Object.keys(compiled.producerOutputs || {}).length) return fallbackWorkflow;
  if (!producerOutputId) throw new Error('producerOutputId is required to resolve a process workflow');
  const output = compiled.producerOutputs?.[producerOutputId];
  if (!output) throw new Error(`Unknown producerOutputId ${producerOutputId}`);
  if (typeId && output.typeId !== typeId) {
    throw new Error(`producerOutputId ${producerOutputId} emits ${output.typeId}, not ${typeId}`);
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
