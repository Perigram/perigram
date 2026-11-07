import { createError } from 'h3';
import { toFlexibleId } from '~/server/utils/objectid.js';
import * as repository from './repository.js';

export async function list(auth = {}, { typeId = null } = {}) {
  const organizationId = resolveOrganizationId(auth);
  const rows = await repository.findByOrganization(
    organizationId,
    typeId ? String(typeId) : null
  );
  return rows.map(repository.serialize);
}

export async function getById(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  return repository.serializeFull(await requireOwnView(id, organizationId));
}

export async function create({ name = '', typeId = '', viewState = {} } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const normalizedName = normalizeName(name);
  const normalizedTypeId = String(typeId || '').trim();
  if (!normalizedName) {
    throw createError({ statusCode: 400, message: 'A view requires a name' });
  }
  if (!normalizedTypeId) {
    throw createError({ statusCode: 400, message: 'A view requires a type' });
  }
  const id = await repository.create({
    organizationId: toFlexibleId(organizationId),
    name: normalizedName,
    typeId: normalizedTypeId,
    viewState: viewState && typeof viewState === 'object' && !Array.isArray(viewState)
      ? viewState
      : {},
    createdBy: auth.userId
  });
  return repository.serialize({ _id: id, name: normalizedName, typeId: normalizedTypeId });
}

export async function update(id, { name, viewState } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await requireOwnView(id, organizationId);
  const changes = {};
  if (name !== undefined) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      throw createError({ statusCode: 400, message: 'A view requires a name' });
    }
    changes.name = normalizedName;
  }
  if (viewState !== undefined) {
    changes.viewState = viewState && typeof viewState === 'object' && !Array.isArray(viewState)
      ? viewState
      : {};
  }
  const updated = await repository.update(id, changes);
  return repository.serializeFull(updated);
}

export async function remove(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const view = await requireOwnView(id, organizationId);
  await repository.remove(view._id);
  return { success: true };
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId;
  if (!organizationId) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  return organizationId;
}

async function requireOwnView(id, organizationId) {
  const view = await repository.findById(id);
  if (!view || String(view.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 404, message: 'View not found' });
  }
  return view;
}

function normalizeName(name) {
  return String(name ?? '').trim();
}
