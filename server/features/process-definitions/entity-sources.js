import { normalizeInstanceRef } from '~/packages/core/src/index.js';

export async function processParentEntity(containment = [], resolveEntity, entity, typeId) {
  const relation = containment.find(item => sameTypeId(item.childType, typeId));
  if (!relation) return null;
  const lineageId = entityLineageId(entity, relation.lineageKey);
  if (!lineageId) return null;
  return resolveEntity(relation.parentType, lineageId);
}

export async function processChildEntities(containment = [], queryEntities, entity, typeId) {
  const instanceId = entityInputId(entity);
  if (!instanceId) return [];
  const relations = containment.filter(item => sameTypeId(item.parentType, typeId));
  const children = await Promise.all(relations.map(relation => (
    queryEntities(relation.childType, { [relation.lineageKey]: String(instanceId) })
  )));
  return children.flat();
}

export async function processRelatedEntities(relations = [], resolveEntity, entity, relationKey, typeId) {
  // A relation edge accepting several target types declares one entry
  // per target: each stored ref resolves through the contract matching
  // the ref's own type.
  const declared = relations.filter(item => (
    sameTypeId(item.ownerType, typeId) && item.key === relationKey
  ));
  if (!declared.length) throw new Error(`${typeId}.${relationKey || ''} is not a declared relation`);
  const stored = entity?.relations?.[declared[0].key];
  const refs = Array.isArray(stored) ? stored : stored ? [stored] : [];
  const resolved = await Promise.all(refs.map(ref => {
    const normalized = normalizeInstanceRef(ref);
    if (!normalized?.id) return null;
    const relation = declared.length === 1
      ? declared[0]
      : declared.find(contract => sameTypeId(contract.targetType, normalized.type || ''));
    return relation ? resolveEntity(relation.targetType, normalized) : null;
  }));
  return resolved.filter(Boolean);
}

function sameTypeId(left, right) {
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
