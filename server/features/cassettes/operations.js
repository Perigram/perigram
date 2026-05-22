import * as cassetteService from './service.js';

export async function saveCassetteTemplate({ entities = {}, parameters = {}, auth }) {
  const body = {
    name: parameters.name,
    type: parameters.type || 'PARAMETRIC',
    data: parameters.definition,
    parameters: parameters.parameters || Object.keys(parameters.definition?.params || {})
  };

  const cassetteId = entities.cassette?._id;
  const cassette = cassetteId
    ? await cassetteService.update(cassetteId, body, auth.userId, auth.organizationId, auth.role, auth)
    : await cassetteService.create(body, auth.userId, auth.organizationId, auth.role, auth);

  return {
    entities: [{ type: 'cassette', id: cassette._id.toString() }],
    data: { cassetteId: cassette._id.toString() }
  };
}
