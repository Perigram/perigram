// App-owned display extensions over the bundle-resolved fact rows — the
// app's only chrome/patch channel beside per-call overrides
// (`utils/instance-display-contract.js` composes both on top of the
// bundle). `fieldGroups` adds per-type groups; `surfaces` patches
// per-type surface chrome. The former project/warehouse entries died with
// those entity types (retired from `cncEntities`); the seam stays empty
// until a live route needs it again — extensions may not reintroduce
// legacy fact channels, only compose over declared types.
export const appInstanceDisplayExtensions = {
  fieldGroups: {},
  surfaces: {}
};
