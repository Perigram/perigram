// CTS type storage service (strangler layer 0): org-authored type
// declarations validated and versioned by the real @perigram/cts registry.
// System types compile from @perigram/domain-cnc at runtime; org types overlay
// them per SPEC §4 (no shadowing), and redefinition goes through the
// refuse-on-breaking diff (SPEC §11).
import { createError } from 'h3';
import * as repository from './repository.js';
import {
  createTypeRegistry, compileClientBundle, frameworkTypes, planTypeMigration
} from '~/packages/cts/src/index.js';
import { cncPackAttachmentKinds } from '~/packages/domain-cnc/src/index.js';
import { composeSystemDeclarations, composePackEditors } from '~/server/packs/declarations.js';
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

// One registry per organization view: system types first, the org's stored
// declarations overlaying. Shadowing a system id throws here (R6/§4).
// Authoring relief (SPEC §11): breaking redefinitions of types with
// zero persisted instances are free — there is nothing to migrate. The
// probe must be synchronous, so authoring callers pre-count the type
// being written into `emptyTypeIds`; every other composition passes no
// probe and refuse-on-breaking holds exactly as before.
export async function compileRegistryForOrganization(organizationId, { emptyTypeIds = null } = {}) {
  const registry = createTypeRegistry({
    id: `cts-types:${organizationId || 'system'}`,
    hasInstances: emptyTypeIds
      ? type => (emptyTypeIds.has(type.id) ? 0 : 1)
      : null
  });
  // System types are the framework's party declarations plus every
  // mounted pack's types in dependency order (SPEC §21 requirements) —
  // no converted legacy entity tables.
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations()]) {
    registry.defineType(declaration);
  }
  if (organizationId) {
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
  return {
    bundle: compileClientBundle(registry, organizationId),
    attachmentKinds: cncPackAttachmentKinds,
    editors: composePackEditors()
  };
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
    // visible before it is retried.
    if (error?.statusCode) throw error;
    const boundBy = await findTypeReferences(organizationId, orgDeclaration.id);
    throw createError({
      statusCode: 400,
      message: error?.message || String(error),
      ...(boundBy.length ? { data: { boundBy } } : {})
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
    ...versioned,
    scope: 'org',
    organizationId: String(organizationId)
  });
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
      ...versioned,
      scope: 'org',
      organizationId: String(organizationId),
      migrated: migration
    });
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
