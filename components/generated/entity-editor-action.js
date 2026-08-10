import GeneratedCassetteDesignerAction from './GeneratedCassetteDesignerAction.vue';

/**
 * Entity editor actions. An entity type that owns an operational editor
 * surface (for example the cassette OCCS designer) exposes one access-gated
 * editor action in generated detail headers, collection footers, and home
 * cards. This is the single registry for editor-action placement and editor
 * identity policy; generated components must not hardcode entity names.
 */
const entityEditorActions = new Map([
  ['cassette', { component: GeneratedCassetteDesignerAction, forceIdentity: false }],
  ['sheet_design', { component: null, forceIdentity: true }]
]);

export function entityEditorActionFor(entityType = '') {
  return entityEditorActions.get(entityType)?.component || null;
}

export function entityHasEditorAction(entityType = '') {
  return Boolean(entityEditorActions.get(entityType)?.component);
}

export function entityEditorForcesIdentity(entityType = '') {
  return Boolean(entityEditorActions.get(entityType)?.forceIdentity);
}
