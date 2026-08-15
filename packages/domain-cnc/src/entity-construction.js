export const cncEntityConstruction = {
  artifact: {
    modes: ['uploadArtifact'],
    defaultMode: 'uploadArtifact',
    derived: true,
    modeInputs: {
      uploadArtifact: [
        {
          id: 'artifact',
          label: 'Artifact file',
          type: 'artifactUpload',
          required: true,
          prompt: true,
          creator: { entityType: 'artifact', attachmentKinds: 'userCreatable' }
        }
      ]
    },
    inputs: []
  },
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
    inputs: [],
    isConstructable: entity => entity.data?.type === 'STANDARD' || Boolean(entity.data?.definition?.extensions?.cutkit?.graphTree)
  },
  facade: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Facade name', path: 'name', type: 'string', required: true, prompt: true }
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
  },
  catalog: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Catalog name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  color: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Color name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  material: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Material name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  material_pile: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Material pile name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  remnant: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Remnant name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  requisition: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Requisition name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  },
  warehouse: {
    modes: ['genericCreate'],
    defaultMode: 'genericCreate',
    inputs: [
      { id: 'name', label: 'Warehouse name', path: 'name', type: 'string', required: true, prompt: true }
    ]
  }
};

export function getEntityConstruction(entityType) {
  return cncEntityConstruction[entityType] || null;
}
