export const cncEntityProducers = [
  {
    id: 'bakeCassetteDesignFromTemplate',
    label: 'Bake cassette design from template',
    labelKey: 'queues.producers.libraryCassette',
    kind: 'construction',
    constructionMode: 'bakeCassetteDesignFromTemplate',
    source: { entityType: 'cassette', access: 'read' },
    output: { entityType: 'cassette_design' }
  },
  {
    id: 'importCassetteDesignFromArtifact',
    label: 'Import cassette design from DXF artifact',
    labelKey: 'queues.producers.uploadDxf',
    kind: 'construction',
    constructionMode: 'importCassetteDesignFromArtifact',
    source: { entityType: 'artifact', access: 'write' },
    output: { entityType: 'cassette_design' }
  }
];
