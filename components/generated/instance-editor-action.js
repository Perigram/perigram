import GeneratedCassetteDesignerAction from './GeneratedCassetteDesignerAction.vue';
import GeneratedEditorPageAction from './GeneratedEditorPageAction.vue';
import { fileEditorActions } from '~/components/generated/file-surfaces.js';

/**
 * Entity editor actions. A file type that owns an operational editor
 * surface (declared by its pack editor binding) exposes one editor action
 * in generated detail headers, collection footers, and home cards; the
 * action opens the editor's registered workspace page. Rows derive from
 * the file-surface registry ('generic' resolves to the shared page
 * action); generated components must not hardcode entity names.
 */
const entityEditorActions = new Map(fileEditorActions());

function actionComponentFor(typeId = '') {
  const action = entityEditorActions.get(typeId)?.action;
  if (action === 'generic') return GeneratedEditorPageAction;
  return action || null;
}

export function instanceEditorActionFor(typeId = '') {
  return actionComponentFor(typeId);
}

export function instanceHasEditorAction(typeId = '') {
  return Boolean(actionComponentFor(typeId));
}
