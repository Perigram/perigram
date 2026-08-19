import { normalizeEntityRef } from '~/packages/core/src/index.js';

export async function processParentEntity(containment = [], resolveEntity, entity, entityType) {
  const relation = containment.find(item => sameEntityType(item.childType, entityType));
  if (!relation) return null;
  const lineageId = entityLineageId(entity, relation.lineageKey);
  if (!lineageId) return null;
  return resolveEntity(relation.parentType, lineageId);
}

export async function processChildEntities(containment = [], queryEntities, entity, entityType) {
  const entityId = entityInputId(entity);
  if (!entityId) return [];
  const relations = containment.filter(item => sameEntityType(item.parentType, entityType));
  const children = await Promise.all(relations.map(relation => (
    queryEntities(relation.childType, { [relation.lineageKey]: String(entityId) })
  )));
  return children.flat();
}

export async function processRelatedEntities(relations = [], resolveEntity, entity, relationKey, entityType) {
  const relation = relations.find(item => (
    sameEntityType(item.ownerType, entityType) && item.key === relationKey
  ));
  if (!relation) throw new Error(`${entityType}.${relationKey || ''} is not a declared relation`);
  const stored = entity?.relations?.[relation.key];
  const refs = Array.isArray(stored) ? stored : stored ? [stored] : [];
  const resolved = await Promise.all(refs.map(ref => {
    const normalized = normalizeEntityRef(ref);
    return normalized?.id ? resolveEntity(relation.targetType, normalized) : null;
  }));
  return resolved.filter(Boolean);
}

function sameEntityType(left, right) {
  return normalizeTypeKey(left) === normalizeTypeKey(right);
}

function normalizeTypeKey(value = '') {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
}

function entityLineageId(entity, lineageKey) {
  const value = entity?.lineage?.[lineageKey] ?? entity?.[lineageKey];
  return value == null ? null : String(value);
}

function entityInputId(entity) {
  if (!entity) return null;
  if (typeof entity !== 'object') return String(entity);
  return String(entity.id || entity._id || entity.identity?.uid || '') || null;
}
