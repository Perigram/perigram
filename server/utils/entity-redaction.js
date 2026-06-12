import { redactEntityForAccess } from '#shared/entity-field-access.js';

export function serializeForAccess(entityType, entity, auth = null) {
  if (!entity) return entity;
  const json = entity.toJSON ? entity.toJSON() : entity;
  return auth ? redactEntityForAccess(json, entityType, auth) : json;
}

export function serializeManyForAccess(entityType, entities = [], auth = null) {
  return entities.map(entity => serializeForAccess(entityType, entity, auth));
}
