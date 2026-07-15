export const cncRelations = [
  containment('library.cassettes', 'library', 'cassette', 'library'),
  containment('cassette.designs', 'cassette', 'cassette_design', 'cassette'),
  containment('project.queues', 'project', 'queue', 'project'),
  containment('queue.revisions', 'queue', 'entity_revision', 'queue', { parentDetail: false }),
  containment('queue.sheetDesigns', 'queue', 'sheet_design', 'queue', { parentDetail: false }),
  containment('queue.cassetteInstances', 'queue', 'cassette_instance', 'queue'),
  containment('catalog.colors', 'catalog', 'color', 'catalog'),
  containment('warehouse.materialPiles', 'warehouse', 'material_pile', 'warehouse'),
  containment('warehouse.remnants', 'warehouse', 'remnant', 'warehouse'),
  containment('materialPile.sheets', 'material_pile', 'sheet', 'materialPile'),
  containment('sheet.cassetteInstances', 'sheet', 'cassette_instance', 'sheet'),
  containment('sheetDesign.instances', 'sheet_design', 'sheet_instance', 'sheetDesign'),
  link('project.libraries', 'project', 'library', 'libraries'),
  link('artifact.source', 'artifact', '*', 'source', 'one')
];

function containment(id, parentType, childType, lineageRole, display = {}) {
  return {
    id,
    kind: 'containment',
    parentType,
    childType,
    lineageRole,
    filterKey: `${lineageRole}Id`,
    cardinality: 'many',
    display: { parentDetail: true, topLevel: false, ...display }
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
