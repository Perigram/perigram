import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';

const WRITABLE_ROOT_BLOCKS = new Set(['identity', 'data', 'specs', 'summary', 'attachments', 'relations']);

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  if (!WRITABLE_ROOT_BLOCKS.has(parts[0])) {
    throw createError({ statusCode: 400, message: `Process updates cannot persist ${parts[0]}` });
  }
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    cursor[key] ||= {};
    cursor = cursor[key];
  }
  cursor[parts[0]] = value;
}

function serialize(model, userPermissions = null) {
  const dto = model?.toJSON ? model.toJSON() : model;
  if (!dto) return null;
  if (!userPermissions) return dto;
  return dto;
}

export function createProcessUpdateHandler({ typeId, repository, Model, toDTO = serialize }) {
  if (!typeId || !repository?.findById || !repository?.updateById || !Model) {
    throw new Error('Process update handler requires typeId, repository, and Model');
  }

  return async function processUpdate(id, patch = {}, auth = {}) {
    const raw = await repository.findById(toFlexibleId(id));
    if (!raw) throw createError({ statusCode: 404, message: `${typeId} not found` });

    const entity = new Model(raw);
    const document = clone(entity.toJSON());
    for (const [path, value] of Object.entries(patch || {})) {
      setByPath(document, path, value);
    }

    document._id = entity._id || entity.id || raw._id;
    if (document.identity?.uid && String(document.identity.uid) !== String(entity.identity?.uid || raw.identity?.uid || raw._id)) {
      throw createError({ statusCode: 400, message: 'Process updates cannot replace entity identity uid' });
    }

    await repository.updateById(document._id, document);
    const updated = await repository.findById(document._id);
    return toDTO(updated, auth);
  };
}
