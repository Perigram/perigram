// CTS type storage service (strangler layer 0): org-authored type
// declarations validated and versioned by the real @perigram/cts registry.
// System types compile from @cutkit/domain-cnc at runtime; org types overlay
// them per SPEC §4 (no shadowing), and redefinition goes through the
// refuse-on-breaking diff (SPEC §11).
import { createError } from 'h3';
import * as repository from './repository.js';
import { createTypeRegistry, compileClientBundle, frameworkTypes } from '~/packages/cts/src/index.js';
import { cncPackContent, cncPackAttachmentKinds } from '~/packages/domain-cnc/src/index.js';
import { invalidateInstanceDeclarations } from '../instances/service.js';

function to400(error) {
  if (error?.statusCode) throw error;
  throw createError({ statusCode: 400, message: error?.message || String(error) });
}

// One registry per organization view: system types first, the org's stored
// declarations overlaying. Shadowing a system id throws here (R6/§4).
export async function compileRegistryForOrganization(organizationId) {
  const registry = createTypeRegistry({ id: `cts-types:${organizationId || 'system'}` });
  // System types are the framework's party declarations plus mounted pack
  // types (SPEC §21) — no converted legacy entity tables.
  for (const declaration of [...frameworkTypes, ...cncPackContent.types]) {
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

  const registry = await compileRegistryForOrganization(organizationId);
  const existing = await repository.findByTypeId(organizationId, orgDeclaration.id);

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
  return removed;
}
