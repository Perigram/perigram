import { createError } from 'h3';
import * as filesService from '../../../../server/features/files/service.js';
import { instanceServiceResolver } from '../../../../server/features/instances/service.js';
import { isOccsDocument, occsParameterNames } from '../../../../utils/occs/parameters.js';

// The cassette designer's save (the pack command the graph and generated
// surfaces drive): the OCCS document is uploaded as the payload — the
// one home — and the row fields (template type, parameter names) patch
// through the generic §13 service. Creation and update are the same
// contract; the geometry revision chain is the generic payload-replacement
// machinery.
export async function saveCassetteTemplate({ entities = {}, parameters = {}, auth }) {
  const definition = parameters.definition;
  if (!isOccsDocument(definition)) {
    throw createError({ statusCode: 400, message: 'Cassette definition must be a valid OCCS document' });
  }
  const buffer = Buffer.from(JSON.stringify(definition), 'utf8');
  const service = instanceServiceResolver('cassette');

  const cassetteId = entities.cassette?._id;
  const cassette = cassetteId
    ? await service.patch(cassetteId, {
      identity: { name: parameters.name },
      data: {
        templateType: parameters.type || 'PARAMETRIC',
        parameters: parameters.parameters || occsParameterNames(definition)
      }
    }, { auth, organizationId: auth.organizationId })
    : await (async () => {
      const stored = await filesService.uploadFile(buffer, `${parameters.name || 'cassette'}.occs`, {
        userId: auth.userId, organizationId: auth.organizationId, type: 'cassette'
      }, 'files');
      return await service.create({
        identity: { name: parameters.name },
        payload: {
          fileId: stored.id,
          mime: 'application/perigram+occs',
          size: buffer.length,
          name: `${parameters.name || 'cassette'}.occs`
        },
        data: {
          templateType: parameters.type || 'PARAMETRIC',
          parameters: parameters.parameters || occsParameterNames(definition)
        }
      }, auth.userId, auth.organizationId);
    })();

  if (cassetteId) {
    await service.replacePayload(cassetteId, {
      buffer,
      filename: `${parameters.name || 'cassette'}.occs`,
      mimeType: 'application/perigram+occs'
    }, { userId: auth.userId, organizationId: auth.organizationId, auth });
  }

  return {
    entities: [{ type: 'cassette', id: String(cassette._id) }],
    events: [{
      type: 'cassette.templateSaved',
      source: { type: 'cassette', id: String(cassette._id) }
    }],
    data: { cassetteId: String(cassette._id) }
  };
}
