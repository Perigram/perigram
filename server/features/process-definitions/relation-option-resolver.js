import { normalizeInstanceRef } from '#packages/core';
import { resolveRelationOptionPath, resolveRelationOptionScope } from './relation-options.js';
import { filterByRelationDomain } from '#shared/relation-domain.js';

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
  const targetTypes = [].concat(action.relationMutation.targetTypes || []).filter(Boolean);
  const where = action.relationMutation.where || null;
  const optionScope = resolveRelationOptionScope(creator);
  if (!optionScope.scoped) {
    // The entry accepts a union of target types: every accepted type's
    // instances are options.
    const pools = await Promise.all(targetTypes.map(typeId => queryEntities(registry, typeId, {}, auth)));
    return withinDomain(pools.flat(), where);
  }
  const sourceInput = optionScope.sourceInput;
  if (!sourceInput) return [];

  const optionPath = resolveRelationOptionPath({
    ownerType: action.typeId,
    sourceType: sourceInput.typeId,
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
    .map(ref => normalizeInstanceRef(ref)?.id)
    .filter(Boolean);
  if (!parentIds.length) return [];
  const creatorAction = compiled.actions?.[creator.actionId];
  if (!creatorAction) return [];
  const optionAuth = createExecutionAuth(auth, creatorAction);
  const sources = (await Promise.all(parentIds.map(id => queryEntities(
    registry,
    sourceInput.typeId,
    { [sourceParent.lineageKey]: String(id) },
    optionAuth
  )))).flat();
  if (source) return sources.map(toPlain);
  const sourceIds = [...new Set(sources.map(instanceId).filter(Boolean).map(String))];
  const targets = (await Promise.all(sourceIds.flatMap(id => targetTypes.map(typeId => queryEntities(
    registry,
    typeId,
    { templateId: id },
    optionAuth
  ))))).flat();
  return withinDomain(Array.from(new Map(targets.map(item => [String(instanceId(item)), toPlain(item)])).values()), where);
}

// The declared target domain (SPEC §6): the same expression the write
// boundary enforces, applied to the picker's candidates (one home:
// shared/relation-domain.js).
function withinDomain(candidates = [], where = null) {
  return filterByRelationDomain(candidates, where);
}

async function queryEntities(registry, typeId, filters, auth) {
  return registry.getInstanceService(typeId).processList(filters, auth);
}

function instanceId(entity = {}) {
  return entity?._id || entity?.id || null;
}

function toPlain(entity) {
  return entity?.toJSON ? entity.toJSON() : entity;
}
