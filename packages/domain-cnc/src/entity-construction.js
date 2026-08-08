export const cncEntityConstruction = {
  project: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  queue: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Queue name', path: 'name', type: 'string', required: true, prompt: true },
      { id: 'materialPool', label: 'Material pool', path: 'job.materialPool', type: 'entityList', accepts: ['material_pile', 'sheet', 'remnant'], required: false },
      { id: 'nestingSettings', label: 'Nesting settings', path: 'nestingSettings', type: 'object', required: false }
    ]
  },
  cassette: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: []
  },
  facade: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    parentEntityType: 'project',
    inputs: [
      { id: 'name', label: 'Facade name', path: 'name', type: 'string', required: true, prompt: true },
      { id: 'sourceModelId', label: 'Source model', path: 'sourceModelId', type: 'entity', entityType: 'artifact', attachmentKinds: ['FACADE_MODEL_SOURCE'], required: false, prompt: true }
    ]
  },
  library: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Library name', path: 'name', type: 'string', required: true, prompt: true },
      { id: 'material', label: 'Material', path: 'data.material', type: 'object', required: false }
    ]
  },
  cassette_design: {
    modes: ['bakeCassetteDesignFromTemplate', 'importCassetteDesignFromArtifact'],
    defaultMode: 'bakeCassetteDesignFromTemplate',
    derived: true,
    modeInputs: {
      bakeCassetteDesignFromTemplate: [
        { id: 'templateId', label: 'Cassette template', path: 'templateId', type: 'entity', entityType: 'cassette', required: true, prompt: true },
        { id: 'parameters', label: 'Parameters', path: 'parameters', type: 'cassetteParameters', templateFieldId: 'templateId', required: false, prompt: true }
      ],
      importCassetteDesignFromArtifact: [
        { id: 'artifactId', label: 'DXF artifact', path: 'artifactId', type: 'entity', entityType: 'artifact', attachmentKinds: ['DXF_SOURCE'], required: true, prompt: true },
        { id: 'layerMapping', label: 'Layer mapping', path: 'layerMapping', type: 'object', required: false, prompt: true },
        { id: 'parameters', label: 'Parameters', path: 'parameters', type: 'object', required: false, prompt: true }
      ]
    },
    inputs: []
  },
  cassette_instance: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'cassetteDesignId', label: 'Cassette design', path: 'data.cassetteDesignId', type: 'entity', entityType: 'cassette_design', required: true }
    ]
  }
};

export function getEntityConstruction(entityType) {
  return cncEntityConstruction[entityType] || {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Name', path: 'name', type: 'string', required: false, prompt: true }
    ]
  };
}
