export const cncEntityCreateInputs = {
  project: [
    { id: 'name', label: 'Project name', path: 'identity.name', type: 'string', required: false }
  ],
  queue: [
    { id: 'jobItems', label: 'Queue items', path: 'data.job.items', type: 'entityList', accepts: ['cassetteDesign'], required: true },
    { id: 'materialPool', label: 'Material pool', path: 'data.job.materialPool', type: 'entityList', accepts: ['materialPile', 'sheet', 'remnant'], required: false },
    { id: 'nestingParams', label: 'Nesting parameters', path: 'data.nestingParams', type: 'object', required: false }
  ],
  cassetteDesign: [
    { id: 'template', label: 'Cassette template', path: 'data.derivedFrom.templateId', type: 'entity', entityType: 'cassetteTemplate', required: true },
    { id: 'parameters', label: 'Parameters', path: 'data.parameters', type: 'object', required: false }
  ],
  cassetteInstance: [
    { id: 'cassetteDesign', label: 'Cassette design', path: 'data.cassetteDesignId', type: 'entity', entityType: 'cassetteDesign', required: true }
  ],
  geometryCapture: [
    { id: 'photo', label: 'Source photo', path: 'attachments.primary', type: 'attachment', required: true },
    { id: 'prompt', label: 'Extraction prompt', path: 'data.extraction.prompt', type: 'object', required: false }
  ],
  material: [
    { id: 'code', label: 'Material code', path: 'data.code', type: 'string', required: true },
    { id: 'description', label: 'Description', path: 'data.description', type: 'string', required: false }
  ],
  materialPile: [
    { id: 'material', label: 'Material', path: 'data.material', type: 'entity', entityType: 'material', required: true },
    { id: 'stock', label: 'Stock', path: 'data.stock', type: 'object', required: true },
    { id: 'specs', label: 'Specs', path: 'specs', type: 'object', required: false }
  ],
  warehouse: [
    { id: 'type', label: 'Warehouse type', path: 'data.type', type: 'string', required: true },
    { id: 'address', label: 'Address', path: 'data.address', type: 'string', required: false }
  ],
  artifact: [
    { id: 'source', label: 'Attachment source', path: 'lineage', type: 'entity', capability: 'attachments.generate', required: true },
    { id: 'file', label: 'File', path: 'attachments.primary', type: 'attachment', required: true }
  ]
};

export function getEntityCreateInputs(entityType) {
  return cncEntityCreateInputs[entityType] || [];
}
