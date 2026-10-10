import GeneratedCassetteDesignerAction from './GeneratedCassetteDesignerAction.vue';
import GeneratedEditorPageAction from './GeneratedEditorPageAction.vue';
import { fileEditorActions } from '~/components/generated/file-surfaces.js';

/**
 * Entity editor actions. A file type that owns an operational editor
 * surface (declared by its editor binding — pack bindings or, since the
 * facade cut, the organization's installed-plugin bindings served with
 * the type view) exposes one editor action in generated detail headers,
 * collection footers, and home cards; the action opens the editor's
 * registered workspace page. Rows derive per call from the file-surface
 * registry ('generic' resolves to the shared page action) so consumers'
 * computeds track the served editor list — a module-scope snapshot
 * would freeze the pre-auth fallback and never see plugin bindings.
 * Generated components must not hardcode entity names.
 */
function actionComponentFor(typeId = '') {
  const row = fileEditorActions().find(([type]) => type === typeId);
  const action = row?.[1]?.action;
  if (action === 'generic') return GeneratedEditorPageAction;
  return action || null;
}

export function instanceEditorActionFor(typeId = '') {
  return actionComponentFor(typeId);
}

export function instanceHasEditorAction(typeId = '') {
  return Boolean(actionComponentFor(typeId));
}
