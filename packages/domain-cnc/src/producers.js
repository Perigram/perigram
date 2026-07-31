export const cncEntityProducers = [
  {
    id: 'createDefaultOccsTemplate',
    label: 'Create cassette template',
    labelKey: 'processDesigner.paletteItems.createDefaultOccsTemplate',
    kind: 'construction',
    constructionMode: 'createDefaultOccsTemplate',
    output: { entityType: 'cassette' }
  },
  {
    id: 'selectExistingCassetteDesign',
    label: 'Select existing cassette design',
    labelKey: 'queues.producers.existingDesign',
    kind: 'entitySource',
    source: { entityType: 'cassette_design', access: 'read' },
    output: { entityType: 'cassette_design' }
  },
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
