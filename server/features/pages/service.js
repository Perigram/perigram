import { createError } from 'h3';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { resolveOrganizationId } from '~/server/utils/organization-scope.js';
import { PAGE_TYPE_ID, pageTypeDeclaration } from '#packages/cts';
import { normalizePageDocument } from '#shared/page-document.js';
import { compileRegistryForOrganization, defineType } from '../cts-types/service.js';
import * as repository from './repository.js';

const KINDS = new Set(['page', 'section']);
const ensuredPageTypes = new Set();
const ensuringPageTypes = new Map();

function ensurePageType(organizationId, actor) {
  const key = String(organizationId);
  if (ensuredPageTypes.has(key)) return Promise.resolve();
  if (ensuringPageTypes.has(key)) return ensuringPageTypes.get(key);
  const pending = (async () => {
    try {
      const registry = await compileRegistryForOrganization(organizationId);
      const current = registry.getType(PAGE_TYPE_ID, organizationId);
      if (!current || Number(current.version || 1) < Number(pageTypeDeclaration.version || 1)) {
        await defineType(pageTypeDeclaration, { organizationId, actor });
      }
      ensuredPageTypes.add(key);
    } catch {
      // The pages surface keeps working when the registry is temporarily
      // uncompilable; the next call retries the seed.
    } finally {
      ensuringPageTypes.delete(key);
    }
  })();
  ensuringPageTypes.set(key, pending);
  return pending;
}

async function preparePages(organizationId, actor) {
  await repository.migrateLegacy(organizationId);
  await repository.migrateDocuments(organizationId);
  await ensurePageType(organizationId, actor);
}

export async function listTree(auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  return (await repository.findByOrganization(organizationId)).map(repository.serialize);
}

export async function getById(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  return repository.serializeFull(page);
}

export async function create({ kind = 'page', name = '', parentId = null, classTypeId = null, blocks = [], order = [] } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const document = normalizePageDocument({ blocks, order });
  if (!KINDS.has(kind)) {
    throw createError({ statusCode: 400, message: 'Unknown page kind' });
  }
  const normalizedName = normalizeName(name);
  const normalizedClassTypeId = classTypeId ? String(classTypeId) : '';
  if (normalizedClassTypeId) {
    if (kind === 'section') {
      throw createError({ statusCode: 400, message: 'A class page is a page' });
    }
    const existing = await repository.findByClassType(organizationId, normalizedClassTypeId);
    if (existing) return repository.serializeFull(existing);
  }
  let normalizedParent = null;
  if (parentId) {
    if (kind === 'section') {
      throw createError({ statusCode: 400, message: 'A section is a root' });
    }
    const parent = await requireParent(parentId, organizationId);
    normalizedParent = toFlexibleId(String(parent._id));
  }
  const id = await repository.create({
    organizationId: toFlexibleId(organizationId),
    kind,
    name: normalizedName,
    parentId: normalizedParent,
    classTypeId: normalizedClassTypeId,
    blocks: document.blocks,
    order: document.order,
    createdBy: auth.userId
  });
  return {
    _id: String(id),
    kind,
    name: normalizedName,
    parentId: normalizedParent ? String(normalizedParent) : null,
    classTypeId: normalizedClassTypeId || null
  };
}

export async function update(id, { name, parentId, blocks, order } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  const changes = {};
  if (name !== undefined) changes.name = normalizeName(name);
  if (blocks !== undefined || order !== undefined) {
    const document = normalizePageDocument({
      blocks: blocks !== undefined ? blocks : page.fields?.blocks,
      order: order !== undefined ? order : page.fields?.order
    });
    changes.blocks = document.blocks;
    changes.order = document.order;
  }
  if (parentId !== undefined) {
    if (page.fields?.section === true && parentId) {
      throw createError({ statusCode: 400, message: 'A section is a root' });
    }
    changes.parentId = toFlexibleId(await resolvedParentId(id, parentId, organizationId));
  }
  const updated = await repository.update(id, changes, organizationId);
  return repository.serializeFull(updated);
}

export async function remove(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  await repository.detachChildren(organizationId, page._id);
  await repository.remove(page._id, organizationId);
  return { success: true };
}

async function requireOwnPage(id, organizationId) {
  const page = await repository.findById(id);
  if (!page || String(page.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 404, message: 'Page not found' });
  }
  return page;
}

async function requireParent(parentId, organizationId) {
  const parent = await repository.findById(parentId);
  if (!parent || String(parent.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 400, message: 'Unknown parent page' });
  }
  return parent;
}

// The new parent of a move: same-org, root-detached, and outside the
// moved page's own subtree (the ancestor walk that refuses cycles).
async function resolvedParentId(id, parentId, organizationId) {
  if (!parentId) return null;
  const parent = await requireParent(parentId, organizationId);
  const movedId = String(id);
  const seen = new Set();
  let current = parent;
  while (current) {
    const currentId = String(current._id);
    if (currentId === movedId || seen.has(currentId)) {
      throw createError({ statusCode: 400, message: 'A page cannot move inside itself' });
    }
    seen.add(currentId);
    const parentRef = current.lineage?.pageId;
    current = parentRef ? await repository.findById(parentRef) : null;
  }
  return String(parentId);
}

function normalizeName(name) {
  return String(name ?? '').trim();
}
