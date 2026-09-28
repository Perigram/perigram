import GeneratedCassetteDesignerAction from './GeneratedCassetteDesignerAction.vue';
import { fileEditorActions } from '~/components/generated/file-surfaces.js';

/**
 * Entity editor actions. A file type that owns an operational editor
 * surface (declared by its pack editor binding) exposes one editor action
 * in generated detail headers, collection footers, and home cards; the
 * action opens the editor's registered workspace page. The rows derive
 * from the file-surface registry; generated components must not hardcode
 * entity names.
 */
const entityEditorActions = new Map(fileEditorActions());

export function instanceEditorActionFor(typeId = '') {
  return entityEditorActions.get(typeId)?.component || null;
}

export function instanceHasEditorAction(typeId = '') {
  return Boolean(entityEditorActions.get(typeId)?.component);
}
