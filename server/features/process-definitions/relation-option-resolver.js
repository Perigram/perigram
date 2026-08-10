import { normalizeEntityRef } from '~/packages/core/src/index.js';
import { resolveRelationOptionPath, resolveRelationOptionScope } from './relation-options.js';

export async function resolveCompiledRelationOptions({
  action,
  compiled,
  owner,
  source = false,
  auth,
  registry,
  createExecutionAuth,
  resolveEntity
} = {}) {
  const creator = action.relationMutation.creator;
  const optionScope = resolveRelationOptionScope(creator);
  if (!optionScope.scoped) {
    return queryEntities(registry, action.relationMutation.targetType, {}, auth);
  }
  const sourceInput = optionScope.sourceInput;
  if (!sourceInput) return [];

  const optionPath = resolveRelationOptionPath({
    ownerType: action.entityType,
    sourceType: sourceInput.entityType,
    lineageBindings: compiled.lineageBindings || [],
    actions: compiled.actions || {}
  });
  if (!optionPath) return [];
  const { ownerParent, sourceParent, bridgeRelationKey } = optionPath;
  const ancestorId = ownerParent && owner.lineage?.[ownerParent.lineageKey];
  if (!ancestorId) return [];
  const ancestor = await resolveEntity(ownerParent.parentType, ancestorId, auth);
  const refs = ancestor.relations?.[bridgeRelationKey];
  const parentIds = (Array.isArray(refs) ? refs : refs ? [refs] : [])
    .map(ref => normalizeEntityRef(ref)?.id)
    .filter(Boolean);
  if (!parentIds.length) return [];
  const creatorAction = compiled.actions?.[creator.actionId];
  if (!creatorAction) return [];
  const optionAuth = createExecutionAuth(auth, creatorAction);
  const sources = (await Promise.all(parentIds.map(id => queryEntities(
    registry,
    sourceInput.entityType,
    { [sourceParent.lineageKey]: String(id) },
    optionAuth
  )))).flat();
  if (source) return sources.map(toPlain);
  const sourceIds = [...new Set(sources.map(entityId).filter(Boolean).map(String))];
  const targets = (await Promise.all(sourceIds.map(id => queryEntities(
    registry,
    action.relationMutation.targetType,
    { templateId: id },
    optionAuth
  )))).flat();
  return Array.from(new Map(targets.map(item => [String(entityId(item)), toPlain(item)])).values());
}

async function queryEntities(registry, entityType, filters, auth) {
  return registry.getEntityService(entityType).processList(filters, auth);
}

function entityId(entity = {}) {
  return entity?._id || entity?.id || entity?.identity?.uid || null;
}

function toPlain(entity) {
  return entity?.toJSON ? entity.toJSON() : entity;
}
