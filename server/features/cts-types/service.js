// CTS type storage service (strangler layer 0): org-authored type
// declarations validated and versioned by the real @perigram/cts registry.
// System types compile from the mounted packs at runtime; org types overlay
// them per SPEC §4 (no shadowing), and redefinition goes through the
// refuse-on-breaking diff (SPEC §11).
import { createError } from 'h3';
import { getOrganizationChangeSequence, runOrganizationChange } from '../instances/index.js';
import * as repository from './repository.js';
import {
  createTypeRegistry, compileClientBundle, frameworkTypes, planTypeMigration
} from '#packages/cts';
import { pluginModuleUrl } from '#shared/plugin-surfaces.js';
import { nodeDefinitionFromService, normalizeNodeDefinition } from '#packages/plugin-sdk/nodes';
import { isWireableValueService } from '../plugins/service-contract.js';
import * as pluginInstalls from '../plugins/repository.js';

import { invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes, pruneInstanceUniqueIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
import { collectionForClass } from '../instances/repository.js';
import { findTypeReferences } from '../process-definitions/service.js';
import { publishOrgContractChanged } from '../instance-events/service.js';

function to400(error) {
  if (error?.statusCode) throw error;
  throw createError({ statusCode: 400, message: error?.message || String(error) });
}

// Steps are one-time (SPEC §11): executed or not, a persisted declaration
// never carries `migrate`. A stored step set would rot into the next edit's
// "declared migration step … matches no breaking change" refusal the moment
// a client round-trips the stored declaration, so every persist strips the
// key (and unsets it from any earlier document).
function withoutMigrateSteps(declaration = {}) {
  const next = { ...declaration };
  delete next.migrate;
  return next;
}

// One registry per organization view: system types first, the org's stored
// declarations overlaying. Shadowing a system id throws here (R6/§4).
// Authoring relief (SPEC §11): breaking redefinitions of types with
// zero persisted instances are free — there is nothing to migrate. The
// probe must be synchronous, so authoring callers pre-count the type
// being written into `emptyTypeIds`; every other composition passes no
// probe and refuse-on-breaking holds exactly as before.
export async function compileRegistryForOrganization(organizationId, { emptyTypeIds = null, excludePluginId = null } = {}) {
  const registry = createTypeRegistry({
    id: `cts-types:${organizationId || 'system'}`,
    hasInstances: emptyTypeIds
      ? type => (emptyTypeIds.has(type.id) ? 0 : 1)
      : null
  });
  // System types are the framework's party declarations (the packs
  // retired into plugins, owner decision 2026-10-17 — their types arrive
  // with the install layer below).
  for (const declaration of frameworkTypes) {
    registry.defineType(declaration);
  }
  if (organizationId) {
    // Installed plugin declarations are a resolution source between
    // system packs and org-authored types (SPEC §Plugin marketplace):
    // same no-shadowing rule, and a collision is a loud composition
    // error naming the plugin layer. Upgrade trials compose the view
    // without the upgrading plugin's own layer.
    for (const declaration of await pluginInstalls.listDeclarationsByOrganization(organizationId, { excludePluginId })) {
      try {
        registry.defineType(declaration);
      } catch (error) {
        throw createError({
          statusCode: 500,
          message: `installed plugin type ${declaration.id} no longer compiles: ${error?.message || error}`
        });
      }
    }
    for (const stored of await repository.listByOrganization(organizationId)) {
      try {
        registry.defineType(stored);
      } catch (error) {
        throw createError({
          statusCode: 500,
          message: `stored org type ${stored.id} no longer compiles: ${error?.message || error}`
        });
      }
    }
  }
  return registry;
}

export async function describeOrganizationTypes(organizationId) {
  const registry = await compileRegistryForOrganization(organizationId);
  const editors = [];
  const attachmentKinds = {};
  // Installed plugin declarations compose beside the enabled packs: editor
  // bindings and attachment kinds are the installed layer of the same
  // served vocabulary (SPEC §Plugin marketplace), under the same laws —
  // a binding must target a file type the composed view declares, one
  // editor per type, and a kind id is claimable once. Plugin-delivered
  // surface declarations (owner decision 2026-10-11) ride the same
  // composition: each surface's module URL resolves against the install's
  // configured executor endpoints — connection settings stay server-side;
  // the browser receives a ready URL (null until the executor is
  // connected, and the loader says so honestly).
  const surfaces = [];
  const previews = [];
  const previewChannels = [];
  const clientEngines = [];
  const clientRuntimes = [];
  const seenChannelIds = new Set();
  if (organizationId) {
    const seenEditors = new Set(editors.map(editor => editor.type));
    const seenPreviewTypes = new Set();
    for (const install of await pluginInstalls.listInstallsByOrganization(organizationId)) {
      for (const surface of install.declarations?.surfaces || []) {
        if (!surface?.id || !surface?.module || !surface.surfaceContract) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} carries a malformed surface declaration: ${JSON.stringify(surface)}`
          });
        }
        surfaces.push(Object.freeze({
          id: surface.id,
          url: pluginModuleUrl(install, surface.module),
          surfaceContract: surface.surfaceContract,
          ...(surface.kind && surface.kind !== 'editor' ? { kind: surface.kind } : {}),
          ...(surface.ownsChrome ? { ownsChrome: true } : {})
        }));
      }
      // Preview bindings (M7): a type's preview slots mount the bound
      // preview surface read-only. The bound type must be declared by the
      // composed view (any class — previews are not editor-bound), one
      // preview per type, and the surface must be one this install
      // declares as kind preview.
      for (const preview of install.declarations?.previews || []) {
        if (!preview?.type || !preview?.surface) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} carries a malformed preview binding: ${JSON.stringify(preview)}`
          });
        }
        const surface = (install.declarations?.surfaces || []).find(entry => entry.id === preview.surface);
        if (!surface || (surface.kind || 'editor') !== 'preview') {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} binds a preview for type ${preview.type} on surface ${preview.surface}, which it does not declare as a preview surface`
          });
        }
        if (!registry.getType(preview.type, organizationId)) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} binds a preview for type ${preview.type}, which the composed view does not declare`
          });
        }
        if (seenPreviewTypes.has(preview.type)) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} re-binds a preview for type ${preview.type} — exactly one preview per type`
          });
        }
        seenPreviewTypes.add(preview.type);
        previews.push(Object.freeze({
          type: preview.type,
          surface: preview.surface,
          url: pluginModuleUrl(install, surface.module),
          surfaceContract: surface.surfaceContract
        }));
      }
      // Designer preview channels (SPEC §28): one designer preview tab
      // per channel, resolved to the install's module URL beside the
      // preview bindings. Channel ids are global across installs — a
      // collision is a composition error.
      for (const channel of install.declarations?.previewChannels || []) {
        if (!channel?.id || !channel?.surface || !channel.label) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} carries a malformed preview channel: ${JSON.stringify(channel)}`
          });
        }
        const surface = (install.declarations?.surfaces || []).find(entry => entry.id === channel.surface);
        if (!surface || (surface.kind || 'editor') !== 'preview') {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} binds preview channel ${channel.id} on surface ${channel.surface}, which it does not declare as a preview surface`
          });
        }
        if (seenChannelIds.has(channel.id)) {
          throw createError({
            statusCode: 500,
            message: `preview channel id ${channel.id} is bound by more than one installed plugin`
          });
        }
        seenChannelIds.add(channel.id);
        previewChannels.push(Object.freeze({
          id: channel.id,
          label: channel.label,
          surface: channel.surface,
          url: pluginModuleUrl(install, surface.module),
          surfaceContract: surface.surfaceContract
        }));
      }
      // Client-carried engines (SPEC §20): the served binding carries the
      // proxied entry-module URL — the package store serves it — beside
      // the plugin-qualified ids of its local services (the ids graphs
      // reference), so the browser owns their dispatch.
      const engine = install.declarations?.engine;
      if (engine?.module) {
        clientEngines.push(Object.freeze({
          pluginId: install.pluginId,
          name: install.name,
          version: String(install.version || ''),
          url: `/api/plugins/${encodeURIComponent(install.pluginId)}/module${engine.module}`,
          services: (install.services || [])
            .filter(service => service?.mode === 'local')
            .map(service => `plugin.${install.pluginId}.${service.id}`)
        }));
      }
      for (const runtime of install.declarations?.runtimes || []) {
        if (runtime.language !== 'javascript' || !runtime.targets?.includes('browser')) continue;
        const entryUrl = pluginModuleUrl(install, runtime.entry);
        if (!entryUrl) {
          throw createError({ statusCode: 500, message: `installed plugin ${install.pluginId} runtime ${runtime.id} has no served package entry` });
        }
        const previewRenderers = (install.declarations?.surfaces || [])
          .filter(surface => surface?.id && surface?.module && surface.kind === 'preview')
          .map(surface => Object.freeze({
            id: surface.id,
            url: pluginModuleUrl(install, surface.module),
            surfaceContract: surface.surfaceContract
          }));
        const runtimeServices = (install.services || [])
          .filter(service => service.execution?.runtime === runtime.id && service.execution.targets?.includes('browser'));
        const nodeDefinitions = runtimeServices
          .filter(service => service.palette?.visible !== false && service.palette?.group && isWireableValueService(service))
          .map(service => normalizeNodeDefinition(nodeDefinitionFromService(service, {
            provider: `plugin.${install.pluginId}`,
            runtimeId: runtime.id
          })));
        clientRuntimes.push(Object.freeze({
          organizationId: String(organizationId),
          pluginId: install.pluginId,
          name: install.name,
          version: String(install.version || ''),
          runtime: Object.freeze({ ...runtime, entryUrl }),
          services: Object.freeze(runtimeServices.map(service => Object.freeze({
            id: service.id,
            execution: service.execution
          }))),
          nodeDefinitions: Object.freeze(nodeDefinitions),
          previewRenderers: Object.freeze(previewRenderers)
        }));
      }
      for (const editor of install.declarations?.editors || []) {
        if (!editor?.type || !editor?.surface || !(editor.modes || []).length) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} carries a malformed editor binding: ${JSON.stringify(editor)}`
          });
        }
        const declaration = registry.getType(editor.type, organizationId);
        if (!declaration) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} binds an editor for type ${editor.type}, which the composed view does not declare`
          });
        }
        if (declaration.class !== 'file') {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} binds an editor for type ${editor.type} of class ${declaration.class} — editor bindings require file types`
          });
        }
        if (seenEditors.has(editor.type)) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} re-binds an editor for type ${editor.type} — exactly one editor per file type`
          });
        }
        seenEditors.add(editor.type);
        editors.push(Object.freeze({ type: editor.type, surface: editor.surface, modes: Object.freeze([...editor.modes]) }));
      }
      for (const [kind, contract] of Object.entries(install.declarations?.attachmentKinds || {})) {
        if (attachmentKinds[kind]) {
          throw createError({
            statusCode: 500,
            message: `attachment kind ${kind} is declared by both an enabled pack and installed plugin ${install.pluginId}`
          });
        }
        attachmentKinds[kind] = contract;
      }
    }
  }
  return {
    bundle: compileClientBundle(registry, organizationId),
    attachmentKinds,
    editors,
    surfaces,
    previews,
    previewChannels,
    clientEngines,
    clientRuntimes
  };
}

export async function defineType(declaration = {}, options = {}) {
  return await defineTypeInternal(declaration, options);
}

async function defineTypeInternal(declaration = {}, { organizationId, actor = null } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const expectedSequence = await getOrganizationChangeSequence(organizationId);
  const orgDeclaration = {
    ...declaration,
    scope: 'org',
    organizationId: String(organizationId)
  };

  const existing = await repository.findByTypeId(organizationId, orgDeclaration.id);
  // An empty type redefines freely: nothing to migrate (SPEC §11).
  const emptyTypeIds = new Set();
  if (existing && (await countInstancesOfType(orgDeclaration.id, organizationId)) === 0) {
    emptyTypeIds.add(orgDeclaration.id);
  }
  // The declared-migration plan (SPEC §11): covered breaking changes pass
  // the registry gate below and execute against instances after the new
  // declaration persists. Uncovered breaking changes refuse inside
  // registry.defineType's R7 gate.
  const plan = existing && !emptyTypeIds.has(orgDeclaration.id)
    ? planTypeMigration(existing, orgDeclaration)
    : null;
  const registry = await compileRegistryForOrganization(organizationId, { emptyTypeIds });

  // Validate the whole org view BEFORE persisting: defineType applies the
  // refuse-on-breaking diff (SPEC §11) and bumps the version, then the
  // compile gate refuses the errors the WRITE ITSELF INTRODUCES (class
  // obligations, cross-type references caused by the candidate). A write
  // that fails its gate must never touch the stored declaration — the
  // previous upsert-first order replaced a valid stored type with an
  // invalid one and wedged every later write in the org. Pre-existing view
  // errors (a historically stored invalid declaration awaiting repair)
  // block nothing but their own repair: an org with one such type can
  // still store valid writes around it, which is what un-wedges it.
  const baseline = registry.compile(organizationId);
  const baselineErrors = new Set(baseline.ok ? [] : baseline.errors);
  let versioned;
  try {
    versioned = registry.defineType(orgDeclaration);
  } catch (error) {
    // Blast radius on the edit path too (Phase 3): a refused write names
    // the processes that bind the type, so a breaking change's reach is
    // visible before it is retried. An uncovered declared-migration plan
    // rides along as `data.plan` (SPEC §11/§14 authoring loop): the
    // breaking change records plus the gate's required-step errors, so the
    // designer can offer the declarative step instead of a dead-end
    // string. Pure serialization — the gate's verdict is unchanged.
    if (error?.statusCode) throw error;
    const boundBy = await findTypeReferences(organizationId, orgDeclaration.id);
    const data = {
      ...(boundBy.length ? { boundBy } : {}),
      ...(plan && !plan.covered ? {
        plan: {
          changes: plan.breaking.map(change => ({ ...change })),
          requiredSteps: [...plan.errors]
        }
      } : {})
    };
    throw createError({
      statusCode: 400,
      message: error?.message || String(error),
      ...(Object.keys(data).length ? { data } : {})
    });
  }
  let compiled;
  try {
    compiled = registry.compile(organizationId);
  } catch (error) {
    to400(error);
  }
  const introduced = (compiled.errors || []).filter(error => !baselineErrors.has(error));
  if (introduced.length) {
    throw createError({ statusCode: 400, message: introduced.join('; ') });
  }

  invalidateInstanceDeclarations(String(organizationId));
  let migrationError = null;
  const stored = await runOrganizationChange(organizationId, {
    kind: 'cts-type-declared',
    typeId: orgDeclaration.id,
    paths: ['declaration', 'typeVersion'],
    actorId: actor
  }, async () => {
    try {
      await ensureInstanceIndexes(registry.resolveView(organizationId), { organizationId });
    } catch (error) {
      if (Number(error?.code) === 11000) {
        throw createError({ statusCode: 409, message: 'Existing instances violate a declared unique constraint' });
      }
      throw error;
    }
    let current = await repository.upsertByTypeId(organizationId, orgDeclaration.id, {
      ...withoutMigrateSteps(versioned),
      scope: 'org',
      organizationId: String(organizationId)
    }, { unset: ['migrate'] });
    // Keep the organization read boundary pending through the one-time
    // instance migration. If migration fails after the declaration write,
    // the sequence still advances for the partially committed schema state.
    if (plan?.covered && plan.breaking.length && plan.steps.length) {
      try {
        const migration = await applyTypeMigrationSteps({
          declaration: versioned,
          organizationId,
          steps: plan.steps,
          toVersion: versioned.version,
          actor,
          collectionForType: typeId => {
            const child = registry.getType(String(typeId), organizationId);
            return child ? collectionForClass(child.class) : null;
          }
        });
        current = await repository.upsertByTypeId(organizationId, orgDeclaration.id, {
          ...withoutMigrateSteps(versioned),
          scope: 'org',
          organizationId: String(organizationId),
          migrated: migration
        }, { unset: ['migrate'] });
      } catch (error) {
        migrationError = error;
      }
    }
    return current;
  }, { expectedSequence });
  if (migrationError) throw migrationError;
  // Declaration writes can change the derived index set (SPEC §13).
  await pruneInstanceUniqueIndexes(registry.resolveView(organizationId), { organizationId });
  publishOrgContractChanged(String(organizationId), 'registry', { typeId: orgDeclaration.id });
  return stored;
}

export async function removeType(typeId, options = {}) {
  return await removeTypeInternal(typeId, options);
}

async function removeTypeInternal(typeId, { organizationId, actor = null, abandon = false } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const expectedSequence = await getOrganizationChangeSequence(organizationId);
  const registry = await compileRegistryForOrganization(organizationId);
  const type = registry.getType(String(typeId), organizationId);
  if (!type) throw createError({ statusCode: 404, message: `Unknown type ${typeId}` });
  if (type.scope === 'system') {
    throw createError({ statusCode: 403, message: 'System types are compiled from domain packs and cannot be deleted' });
  }
  // Removal ceremony: README §Removal ceremony (root SPEC §15).
  const [instances, boundBy] = await Promise.all([
    countInstancesOfType(String(typeId), organizationId),
    findTypeReferences(organizationId, String(typeId))
  ]);
  const hasBlastRadius = instances > 0 || boundBy.length > 0;
  if (hasBlastRadius && !abandon) {
    const parts = [];
    if (instances > 0) parts.push(`${instances} persisted instance(s)`);
    if (boundBy.length > 0) parts.push(`bound by ${boundBy.length} process definition(s): ${boundBy.map(b => b.name || b.id).join(', ')}`);
    throw createError({
      statusCode: 409,
      message: `Type ${typeId} still has ${parts.join(' and ')}`,
      data: { instances, boundBy }
    });
  }
  const removed = await runOrganizationChange(organizationId, {
    kind: 'cts-type-removed',
    typeId: String(typeId),
    paths: ['declaration'],
    actorId: actor
  }, async () => {
    const result = await repository.deleteByTypeId(organizationId, typeId);
    invalidateInstanceDeclarations(String(organizationId));
    return result;
  }, { expectedSequence });
  // A removed type may have been the last declaring an edge index.
  const after = await compileRegistryForOrganization(organizationId);
  await ensureInstanceIndexes(after.resolveView(organizationId), { organizationId });
  await pruneInstanceUniqueIndexes(after.resolveView(organizationId), { organizationId });
  const abandoned = hasBlastRadius
    ? { instances, boundBy: boundBy.length, actor: actor || 'SYSTEM', at: new Date().toISOString() }
    : null;
  publishOrgContractChanged(String(organizationId), 'registry', {
    typeId: String(typeId),
    removed: true,
    ...(abandoned ? { abandoned } : {})
  });
  return { removed, instances, boundBy, abandoned };
}
