import { redactEntityForAccess } from '#shared/entity-field-access.js';

export function serializeForAccess(typeId, entity, auth = null) {
  if (!entity) return entity;
  const json = entity.toJSON ? entity.toJSON() : entity;
  return auth ? redactEntityForAccess(json, typeId, auth) : json;
}

export function serializeManyForAccess(typeId, entities = [], auth = null) {
  return entities.map(entity => serializeForAccess(typeId, entity, auth));
}
