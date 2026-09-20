import GeneratedCassetteDesignerAction from './GeneratedCassetteDesignerAction.vue';
import { fileEditorActions } from '~/components/generated/file-surfaces.js';

/**
 * Entity editor actions. A file type that owns an operational editor
 * surface (declared by its pack editor binding) exposes one access-gated
 * editor action in generated detail headers, collection footers, and home
 * cards. The rows derive from the file-surface registry; generated
 * components must not hardcode entity names.
 */
const entityEditorActions = new Map(fileEditorActions());

export function entityEditorActionFor(entityType = '') {
  return entityEditorActions.get(entityType)?.component || null;
}

export function entityHasEditorAction(entityType = '') {
  return Boolean(entityEditorActions.get(entityType)?.component);
}

export function entityEditorForcesIdentity(entityType = '') {
  return Boolean(entityEditorActions.get(entityType)?.forceIdentity);
}
