export const cncEntityProducers = [
  {
    id: 'bakeCassetteDesignFromTemplate',
    label: 'Bake cassette design from template',
    labelKey: 'queues.producers.libraryCassette',
    kind: 'construction',
    constructionMode: 'bakeCassetteDesignFromTemplate',
    source: { typeId: 'cassette', access: 'read' },
    output: { typeId: 'cassette_design' }
  },
  {
    id: 'importCassetteDesignFromArtifact',
    label: 'Import cassette design from DXF artifact',
    labelKey: 'queues.producers.uploadDxf',
    kind: 'construction',
    constructionMode: 'importCassetteDesignFromArtifact',
    source: { typeId: 'artifact', access: 'write' },
    output: { typeId: 'cassette_design' }
  }
];
