import * as conversionService from './service.js';

// The command handler stays domain-free: the organization's installed
// plugins supply the declared conversion catalog (entity-target
// conversions dispatch to the plugin's executor — see the feature's
// service). Without an install, no conversions are known.
import * as conversionService from './service.js';
import { conversionsForOrganization } from '../plugins/service.js';

export async function convertArtifact({ entities = {}, parameters = {}, auth }) {
  const organizationId = auth?.organizationId || auth?.memberships?.[0]?.organizationId || null;
  const converted = await conversionService.convertArtifact({
    artifact: entities.artifact,
    conversionId: parameters.conversion,
    name: parameters.name,
    layerMapping: parameters.layerMapping,
    parameters: parameters.parameters
  }, auth, { conversions: await conversionsForOrganization(organizationId) });
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
