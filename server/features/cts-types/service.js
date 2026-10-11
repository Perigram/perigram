// CTS type storage service (strangler layer 0): org-authored type
// declarations validated and versioned by the real @perigram/cts registry.
// System types compile from the mounted packs at runtime; org types overlay
// them per SPEC §4 (no shadowing), and redefinition goes through the
// refuse-on-breaking diff (SPEC §11).
import { createError } from 'h3';
import * as repository from './repository.js';
import {
  createTypeRegistry, compileClientBundle, frameworkTypes, planTypeMigration
} from '~/packages/cts/src/index.js';
import { composeSystemDeclarations, composePackEditors, composePackAttachmentKinds, orderedMountedPacks } from '~/server/packs/declarations.js';
import * as pluginInstalls from '../plugins/repository.js';

// The org's enabled mounted packs: disablement records filter the pack
// layer of the system view (SPEC §Plugin marketplace — absence enabled).
async function enabledPacksFor(organizationId, disabledPackIds = null) {
  const disabled = disabledPackIds
    || new Set(await pluginInstalls.listDisabledPacks(organizationId).catch(() => []));
  return orderedMountedPacks().filter(pack => !disabled.has(pack.id));
}
import { invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
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
export async function compileRegistryForOrganization(organizationId, { emptyTypeIds = null, excludePluginId = null, disabledPackIds = null } = {}) {
  const registry = createTypeRegistry({
    id: `cts-types:${organizationId || 'system'}`,
    hasInstances: emptyTypeIds
      ? type => (emptyTypeIds.has(type.id) ? 0 : 1)
      : null
  });
  // System types are the framework's party declarations plus every
  // ENABLED mounted pack's types in dependency order (SPEC §21
  // requirements) — orgs hold disablement records against packs
  // (SPEC §Plugin marketplace).
  const packs = organizationId
    ? await enabledPacksFor(organizationId, disabledPackIds)
    : orderedMountedPacks();
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations(packs)]) {
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
  const packs = organizationId
    ? await enabledPacksFor(organizationId)
    : orderedMountedPacks();
  const disabledPackIds = new Set(orderedMountedPacks().filter(pack => !packs.includes(pack)).map(pack => pack.id));
  const registry = await compileRegistryForOrganization(organizationId, { disabledPackIds });
  const editors = [...composePackEditors(packs)];
  const attachmentKinds = composePackAttachmentKinds(packs);
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
  if (organizationId) {
    const seenEditors = new Set(editors.map(editor => editor.type));
    const seenPreviewTypes = new Set();
    for (const install of await pluginInstalls.listInstallsByOrganization(organizationId)) {
      const endpointOrigin = firstEndpointOrigin(install);
      for (const surface of install.declarations?.surfaces || []) {
        if (!surface?.id || !surface?.module || !surface.surfaceContract) {
          throw createError({
            statusCode: 500,
            message: `installed plugin ${install.pluginId} carries a malformed surface declaration: ${JSON.stringify(surface)}`
          });
        }
        surfaces.push(Object.freeze({
          id: surface.id,
          url: endpointOrigin ? `${endpointOrigin}${surface.module}` : null,
          surfaceContract: surface.surfaceContract,
          ...(surface.kind && surface.kind !== 'editor' ? { kind: surface.kind } : {})
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
          url: endpointOrigin ? `${endpointOrigin}${surface.module}` : null,
          surfaceContract: surface.surfaceContract
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
    previews
  };
}

// The origin a plugin's surface modules load from: the first configured
// endpoint-mode connection — the executor serves its UI beside its
// services. No configured endpoint means no loadable module; the client
// renders the connect-the-executor state instead of guessing.
function firstEndpointOrigin(install) {
  for (const url of Object.values(install?.endpoints || {})) {
    try {
      return new URL(String(url)).origin;
    } catch {
      continue;
    }
  }
  return null;
}

export async function defineType(declaration = {}, { organizationId, actor = null } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
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
  let stored = await repository.upsertByTypeId(organizationId, orgDeclaration.id, {
    ...withoutMigrateSteps(versioned),
    scope: 'org',
    organizationId: String(organizationId)
  }, { unset: ['migrate'] });
  // Covered breaking changes execute here: instances are behind the new
  // version from this write until the executor stamps them, so the run is
  // synchronous and idempotent (finished documents carry the new
  // typeVersion and are skipped on re-post).
  if (plan?.covered && plan.breaking.length && plan.steps.length) {
    const migration = await applyTypeMigrationSteps({
      declaration: versioned,
      organizationId,
      steps: plan.steps,
      toVersion: versioned.version,
      actor
    });
    stored = await repository.upsertByTypeId(organizationId, orgDeclaration.id, {
      ...withoutMigrateSteps(versioned),
      scope: 'org',
      organizationId: String(organizationId),
      migrated: migration
    }, { unset: ['migrate'] });
  }
  // Declaration writes can change the derived index set (SPEC §13).
  await ensureInstanceIndexes(registry.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', { typeId: orgDeclaration.id });
  return stored;
}

export async function removeType(typeId, { organizationId, actor = null, abandon = false } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const registry = await compileRegistryForOrganization(organizationId);
  const type = registry.getType(String(typeId), organizationId);
  if (!type) throw createError({ statusCode: 404, message: `Unknown type ${typeId}` });
  if (type.scope === 'system') {
    throw createError({ statusCode: 403, message: 'System types are compiled from domain packs and cannot be deleted' });
  }
  // Deleting a type is a ceremony (SPEC §19 abandoned data): the removal
  // diff runs against reality first — living instances and non-archived
  // processes that bind the type. Both refuse the delete until the caller
  // explicitly abandons; the abandonment (counts + actor) rides the org
  // contract-change event and the response as the record.
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
      message: `Type ${typeId} still has ${parts.join(' and ')} — pass abandon: true to abandon (SPEC §19)`,
      data: { instances, boundBy }
    });
  }
  const removed = await repository.deleteByTypeId(organizationId, typeId);
  invalidateInstanceDeclarations(String(organizationId));
  // A removed type may have been the last declaring an edge index.
  const after = await compileRegistryForOrganization(organizationId);
  await ensureInstanceIndexes(after.resolveView(organizationId));
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
