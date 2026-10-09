import * as conversionService from './service.js';

// The command handler stays domain-free: the mounted pack's override
// supplies the declared conversion catalog and entity-target executors
// (see packages/facade/server). Without a pack, no conversions are known.
export async function convertArtifact({ entities = {}, parameters = {}, auth }, { conversions = [] } = {}) {
  const converted = await conversionService.convertArtifact({
    artifact: entities.artifact,
    conversionId: parameters.conversion,
    name: parameters.name,
    layerMapping: parameters.layerMapping,
    parameters: parameters.parameters
  }, auth, { conversions });
  const id = converted.entity._id?.toString?.() || String(converted.entity._id);
  return {
    entities: [{ type: converted.type, id, entity: converted.entity }],
    events: [{
      type: 'artifact.converted',
      source: { type: 'artifact', id: String(entities.artifact._id) },
      entities: [{ type: converted.type, id }],
      data: { conversion: parameters.conversion }
    }],
    data: { conversion: parameters.conversion, typeId: converted.type, instanceId: id }
  };
}
