import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { withMongoSnapshotTransaction } from '~/server/db/transactions.js';

// Unlink one declared typed relation target. The instance service owns edge
// cardinality, target-domain, tenancy, revision, and write-grant validation.
export default defineEventHandler(async event => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  const relationKey = getRouterParam(event, 'key');
  if (!typeId || !id || !relationKey) {
    throw createError({ statusCode: 400, statusMessage: 'type, id, and relation key are required' });
  }
  const body = await readBody(event);
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !body.target || typeof body.target !== 'object'
    || body.expectedRevision == null
    || (body.expectedOrganizationSequence != null
      && (!Number.isSafeInteger(body.expectedOrganizationSequence) || body.expectedOrganizationSequence < 0))) {
    throw createError({ statusCode: 400, statusMessage: 'target and expectedRevision are required; expectedOrganizationSequence must be a non-negative integer when supplied' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.unlinkRelationForHttp !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no relation-unlink service for type ${typeId}` });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await withMongoSnapshotTransaction(session => service.unlinkRelationForHttp(id, relationKey, body.target, {
    auth,
    organizationId,
    expectedRevision: body.expectedRevision,
    expectedOrganizationSequence: body.expectedOrganizationSequence ?? null,
    session
  }));
});
