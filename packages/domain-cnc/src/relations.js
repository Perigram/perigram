export const cncRelations = [
  containment('library.cassettes', 'library', 'cassette', 'libraryId'),
  containment('project.queues', 'project', 'queue', 'projectId'),
  containment('queue.nestingRuns', 'queue', 'nesting_run', 'queueId'),
  containment('nestingRun.sheetDesigns', 'nesting_run', 'sheet_design', 'runId'),
  containment('catalog.colors', 'catalog', 'color', 'catalogId'),
  containment('materialPile.sheets', 'material_pile', 'sheet', 'pileId'),
  containment('sheet.cassetteInstances', 'sheet', 'cassette_instance', 'sheetId'),
  containment('sheetDesign.instances', 'sheet_design', 'sheet_instance', 'sheetDesignId'),
  link('project.libraries', 'project', 'library', 'libraries'),
  link('artifact.source', 'artifact', '*', 'source', 'one')
];

function containment(id, parentType, childType, parentIdKey) {
  return {
    id,
    kind: 'containment',
    parentType,
    childType,
    parentIdKey,
    parentRevisionIdKey: `${parentIdKey.replace(/Id$/, '')}RevisionId`,
    cardinality: 'many',
    display: { parentDetail: true, topLevel: false }
  };
}

function link(id, sourceType, targetType, key, cardinality = 'many') {
  return {
    id,
    kind: 'link',
    sourceType,
    targetType,
    key,
    path: `relations.${key}`,
    cardinality,
    display: { detail: true }
  };
}

export function containmentForChild(relations = [], childType = '', parentType = '') {
  return relations.find(relation => relation.kind === 'containment'
    && relation.childType === childType
    && (!parentType || relation.parentType === parentType)) || null;
}

export function relationsFromSource(relations = [], sourceType = '') {
  return relations.filter(relation => relation.kind === 'link' && relation.sourceType === sourceType);
}
