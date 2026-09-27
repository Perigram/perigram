import { createError } from 'h3';
import * as filesService from '../files/service.js';
import { instanceServiceResolver } from '../instances/service.js';
import { isOccsDocument } from '~/utils/occs/parameters.js';
import { evaluateOccsCassetteTemplate } from '~/utils/occs/evaluate.js';

// The `bake` construction handler for `cassette-design` (SPEC §21): the
// pack mount binds it as the type's only construction mode. Baking is
// evaluation semantics — the same pure OCCS evaluator the template editor
// uses — applied once at construction: load the template instance, read
// its OCCS payload, evaluate with the row's parameter values, and create
// the cassette-design through the generic instance create carrying the
// baked geometry. Template edits after construction never propagate to
// production pieces. Only OCCS parametric templates bake; STANDARD
// (DXF-imported) templates carry their own geometry and are referenced,
// not baked.
export async function bakeCassetteDesign(draft = {}, context = {}) {
  const templateId = String(draft?.data?.template || draft?.template || '').trim();
  if (!templateId) {
    throw createError({ statusCode: 400, message: 'Cassette design bake requires a template reference' });
  }
  const parameters = draft?.data?.parameters || draft?.parameters || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw createError({ statusCode: 400, message: 'Cassette design bake parameters must be an object' });
  }

  const cassetteService = instanceServiceResolver('cassette');
  const template = await cassetteService.getById(templateId);
  if (!template) {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} not found` });
  }
  const organizationId = context.organizationId || null;
  const templateOrg = template.lineage?.organizationId ? String(template.lineage.organizationId) : null;
  if (organizationId && templateOrg && templateOrg !== String(organizationId)) {
    throw createError({ statusCode: 400, message: 'Cassette template belongs to another organization' });
  }

  const payloadRef = template.attachments?.primary || null;
  if (!payloadRef?.fileId) {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} carries no OCCS payload` });
  }
  // The §3 payload blob home is the `files` GridFS bucket.
  const buffer = await filesService.getFileBuffer(payloadRef.fileId, 'files');
  let definition = null;
  try {
    definition = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} payload is not a readable OCCS document` });
  }
  if (!isOccsDocument(definition)) {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} is not an OCCS parametric template — only OCCS templates bake` });
  }

  const evaluation = await evaluateOccsCassetteTemplate(definition, parameters, {
    templateId,
    templateName: template.identity?.name || 'Cassette template'
  });

  const designService = instanceServiceResolver('cassette-design');
  return await designService.create({
    identity: { name: draft.identity?.name || template.identity?.name || null },
    data: {
      template: String(template._id),
      parameters,
      geometry: evaluation
    },
    lineage: draft.lineage,
    relations: draft.relations,
    provenance: draft.provenance
  }, context.userId, organizationId);
}
