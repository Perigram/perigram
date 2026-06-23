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
      { id: 'jobItems', label: 'Queue items', path: 'job.items', type: 'entityList', accepts: ['cassette_design'], required: true },
      { id: 'materialPool', label: 'Material pool', path: 'job.materialPool', type: 'entityList', accepts: ['material_pile', 'sheet', 'remnant'], required: false },
      { id: 'nestingParams', label: 'Nesting parameters', path: 'nestingParams', type: 'object', required: false }
    ]
  },
  cassette_design: {
    modes: ['bakeCassetteDesignFromTemplate'],
    defaultMode: 'bakeCassetteDesignFromTemplate',
    derived: true,
    inputs: [
      { id: 'name', label: 'Design name', path: 'name', type: 'string', required: true, prompt: true },
      { id: 'templateId', label: 'Cassette template', path: 'templateId', type: 'entity', entityType: 'cassette', required: true, prompt: true },
      { id: 'parameters', label: 'Parameters', path: 'parameters', type: 'object', required: false, prompt: true }
    ]
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
