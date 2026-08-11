import * as conversionService from './service.js';

export async function convertArtifact({ entities = {}, parameters = {}, auth }) {
  const converted = await conversionService.convertArtifact({
    artifact: entities.artifact,
    conversionId: parameters.conversion,
    name: parameters.name,
    layerMapping: parameters.layerMapping,
    parameters: parameters.parameters
  }, auth);
  const id = converted.entity._id?.toString?.() || String(converted.entity._id);
  return {
    entities: [{ type: converted.type, id, entity: converted.entity }],
    events: [{
      type: 'artifact.converted',
      source: { type: 'artifact', id: String(entities.artifact._id) },
      entities: [{ type: converted.type, id }],
      data: { conversion: parameters.conversion }
    }],
    data: { conversion: parameters.conversion, entityType: converted.type, entityId: id }
  };
}
