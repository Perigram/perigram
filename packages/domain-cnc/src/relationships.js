// Legacy pack-internal residue (SPEC §21): these tables predate the CTS
// type view and are scheduled to die with the legacy layer. They are
// trimmed to pairs whose endpoints survive in `cncEntities`; nothing new
// may be added here.
export const cncContainment = [
  { parentType: 'cassette', childType: 'cassette_design', lineageKey: 'templateId' },
  { parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }
];

export const cncRelations = [
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
