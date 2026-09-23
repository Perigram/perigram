// Residual fact vocabulary for types that are NOT declared in the type
// system (one fact vocabulary). Live-type audit (2026-09): every declared
// type carries its fact vocabulary as field descriptors on its
// declaration, compiled into the served CTS client bundle and resolved by
// `utils/instance-display-contract.js` (`factsFor`) as the only fact
// source. This map survives ONLY for the artifact family —
// `artifact_template`, undeclared master data that Phase 7 cuts later
// (`artifact` itself is framework-declared and resolves from the bundle).
//
// Everything else that once lived here rendered entity types retired from
// `cncEntities` (project, queue, nestingRun, sheet, remnant, catalog,
// geometryCapture, warehouse, library, material piles, requisition,
// cassetteTemplate/cassetteInstance) or master data whose legacy surfaces
// are gone (toolProfile, machine, profileTemplate); those rows died with
// the legacy fact channel.
//
// Nothing new may be added here: declare the type and author its field
// descriptors instead.
export const cncInstanceFieldGroups = {
  artifactTemplate: {
    summary: [
      { path: 'data.format', i18n: 'file.type', display: 'text', priority: 10 },
      { path: 'data.variables.length', i18n: 'artifactTemplates.variables', display: 'count', priority: 20 }
    ],
    provenance: [
      { path: 'data.activeRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', typeId: 'entityRevision', priority: 30 }
    ]
  }
};

export function getEntityFieldGroups(entityKey) {
  return cncInstanceFieldGroups[entityKey] || {};
}
