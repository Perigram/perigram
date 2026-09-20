import { isCreateAction, isRelationLinkAction, isRelationUnlinkAction } from './action-visibility.js';

export const GENERATED_ACTION_SURFACES = Object.freeze({
  collection: 'collection',
  entity: 'entity',
  relation: 'relation'
});

export function generatedActionSurface(action = {}) {
  if (action?.relationMutation || isRelationLinkAction(action || {}) || isRelationUnlinkAction(action || {})) return GENERATED_ACTION_SURFACES.relation;
  if (isCreateAction(action || {})) return GENERATED_ACTION_SURFACES.collection;
  return GENERATED_ACTION_SURFACES.entity;
}

export function generatedActionRendersAt(action = {}, surfaces = []) {
  return (Array.isArray(surfaces) ? surfaces : [surfaces]).includes(generatedActionSurface(action));
}
