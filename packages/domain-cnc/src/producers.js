export const cncEntityProducers = [
  {
    id: 'selectExistingCassetteDesign',
    label: 'Select existing cassette design',
    kind: 'entitySource',
    source: { entityType: 'cassette_design', access: 'read' },
    output: { entityType: 'cassette_design' }
  },
  {
    id: 'bakeCassetteDesignFromTemplate',
    label: 'Bake cassette design from template',
    kind: 'construction',
    constructionMode: 'bakeCassetteDesignFromTemplate',
    source: { entityType: 'cassette', access: 'read' },
    output: { entityType: 'cassette_design' }
  },
  {
    id: 'importCassetteDesignFromArtifact',
    label: 'Import cassette design from DXF artifact',
    kind: 'construction',
    constructionMode: 'importCassetteDesignFromArtifact',
    source: { entityType: 'artifact', access: 'write' },
    output: { entityType: 'cassette_design' }
  }
];
