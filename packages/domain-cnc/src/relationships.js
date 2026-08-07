export const cncContainment = [
  { parentType: 'project', childType: 'facade', lineageKey: 'projectId' },
  { parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' },
  { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
  { parentType: 'queue', childType: 'nesting_run', lineageKey: 'queueId' },
  { parentType: 'nesting_run', childType: 'sheet_design', lineageKey: 'runId' },
  { parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' },
  { parentType: 'sheet', childType: 'cassette_instance', lineageKey: 'sheetId' },
  { parentType: 'catalog', childType: 'color', lineageKey: 'catalogId' },
  { parentType: 'material_pile', childType: 'sheet', lineageKey: 'pileId' },
  { parentType: 'sheet', childType: 'remnant', lineageKey: 'sheetId' }
];

export const cncRelations = [
  { ownerType: 'facade', key: 'sourceModel', targetType: 'artifact', cardinality: 'one' },
  { ownerType: 'facade', key: 'patterns', targetType: 'facade_pattern', cardinality: 'many' },
  { ownerType: 'facade', key: 'libraries', targetType: 'library', cardinality: 'many' },
  { ownerType: 'library', key: 'facadePatterns', targetType: 'facade_pattern', cardinality: 'many' },
  {
    ownerType: 'queue',
    key: 'cassettes',
    targetType: 'cassette_design',
    cardinality: 'many',
    association: {
      path: 'data.job.items',
      defaults: { quantity: 1 }
    }
  },
  {
    ownerType: 'geometry_capture',
    key: 'sourcePhoto',
    targetType: 'artifact',
    cardinality: 'one'
  },
  {
    ownerType: 'cassette',
    key: 'sourceDxf',
    targetType: 'artifact',
    cardinality: 'one'
  },
  {
    ownerType: 'cassette_design',
    key: 'sourceDxf',
    targetType: 'artifact',
    cardinality: 'one'
  }
];
