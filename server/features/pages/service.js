import { createError } from 'h3';
import { toFlexibleId } from '~/server/utils/objectid.js';
import * as repository from './repository.js';

const KINDS = new Set(['page', 'section']);

export async function listTree(auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  return (await repository.findByOrganization(organizationId)).map(repository.serialize);
}

export async function getById(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const page = await requireOwnPage(id, organizationId);
  return repository.serializeFull(page);
}

export async function create({ kind = 'page', name = '', parentId = null } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  if (!KINDS.has(kind)) {
    throw createError({ statusCode: 400, message: 'Unknown page kind' });
  }
  const normalizedName = normalizeName(name);
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
    content: '',
    createdBy: auth.userId
  });
  return repository.serialize({ _id: id, kind, name: normalizedName, parentId: normalizedParent });
}

export async function update(id, { name, parentId, content } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const page = await requireOwnPage(id, organizationId);
  const changes = {};
  if (name !== undefined) changes.name = normalizeName(name);
  if (content !== undefined) changes.content = String(content ?? '');
  if (parentId !== undefined) {
    if (page.kind === 'section' && parentId) {
      throw createError({ statusCode: 400, message: 'A section is a root' });
    }
    changes.parentId = toFlexibleId(await resolvedParentId(id, parentId, organizationId));
  }
  const updated = await repository.update(id, changes);
  return repository.serializeFull(updated);
}

export async function remove(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const page = await requireOwnPage(id, organizationId);
  await repository.detachChildren(organizationId, page._id);
  await repository.remove(page._id);
  return { success: true };
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId;
  if (!organizationId) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  return organizationId;
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
    current = current.parentId ? await repository.findById(current.parentId) : null;
  }
  return String(parentId);
}

function normalizeName(name) {
  return String(name ?? '').trim();
}
