// CTS type storage service (strangler layer 0): org-authored type
// declarations validated and versioned by the real @perigram/cts registry.
// System types compile from @cutkit/domain-cnc at runtime; org types overlay
// them per SPEC §4 (no shadowing), and redefinition goes through the
// refuse-on-breaking diff (SPEC §11).
import { createError } from 'h3';
import * as repository from './repository.js';
import { createTypeRegistry, compileClientBundle, frameworkTypes } from '~/packages/cts/src/index.js';
import { cncPackAttachmentKinds } from '~/packages/domain-cnc/src/index.js';
import { composeSystemDeclarations } from '~/server/packs/declarations.js';
import { invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { publishOrgContractChanged } from '../entity-events/service.js';

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
    attachmentKinds: cncPackAttachmentKinds
  };
}

export async function defineType(declaration = {}, { organizationId } = {}) {
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
  const registry = await compileRegistryForOrganization(organizationId, { emptyTypeIds });

  let stored;
  try {
    // Redefinition path: the registry applies the refuse-on-breaking diff
    // (SPEC §11) and bumps the version on compatible changes.
    const versioned = registry.defineType(orgDeclaration);
    invalidateInstanceDeclarations(String(organizationId));
    stored = await repository.upsertByTypeId(organizationId, orgDeclaration.id, {
      ...versioned,
      scope: 'org',
      organizationId: String(organizationId)
    });
  } catch (error) {
    to400(error);
  }

  // Compile the whole org view before answering: shadowing and cross-type
  // breakage (R2 targets) must fail the write, not the next read.
  let compiled;
  try {
    compiled = registry.compile(organizationId);
  } catch (error) {
    to400(error);
  }
  if (!compiled.ok) {
    if (!existing) await repository.deleteByTypeId(organizationId, orgDeclaration.id);
    throw createError({ statusCode: 400, message: compiled.errors.join('; ') });
  }
  // Declaration writes can change the derived index set (SPEC §13).
  await ensureInstanceIndexes(registry.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', { typeId: orgDeclaration.id });
  return stored;
}

export async function removeType(typeId, { organizationId } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const registry = await compileRegistryForOrganization(organizationId);
  const type = registry.getType(String(typeId), organizationId);
  if (!type) throw createError({ statusCode: 404, message: `Unknown type ${typeId}` });
  if (type.scope === 'system') {
    throw createError({ statusCode: 403, message: 'System types are compiled from domain packs and cannot be deleted' });
  }
  const removed = await repository.deleteByTypeId(organizationId, typeId);
  invalidateInstanceDeclarations(String(organizationId));
  // A removed type may have been the last declaring an edge index.
  const after = await compileRegistryForOrganization(organizationId);
  await ensureInstanceIndexes(after.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', { typeId: String(typeId), removed: true });
  return removed;
}
