import { cncEntityConstruction } from './entity-construction.js';

export const cncEntityCreateInputs = {
  project: cncEntityConstruction.project.inputs,
  queue: cncEntityConstruction.queue.inputs,
  cassette_design: cncEntityConstruction.cassette_design.inputs,
  cassette_instance: cncEntityConstruction.cassette_instance.inputs,
  geometryCapture: [
    { id: 'photo', label: 'Source photo', path: 'attachments.primary', type: 'attachment', required: true },
    { id: 'prompt', label: 'Extraction prompt', path: 'data.extraction.prompt', type: 'object', required: false }
  ],
  material: [
    { id: 'code', label: 'Material code', path: 'data.code', type: 'string', required: true },
    { id: 'description', label: 'Description', path: 'data.description', type: 'string', required: false },
    { id: 'thickness', label: 'Sheet thickness', path: 'data.thickness', type: 'number', required: false, min: 0, unit: 'mm' }
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
  artifact: cncEntityConstruction.artifact.inputs
};

export function getEntityCreateInputs(entityType) {
  return cncEntityCreateInputs[entityType] || [];
}
