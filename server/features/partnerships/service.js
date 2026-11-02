import { createError } from 'h3';
import * as repository from './repository.js';
import * as organizationsService from '../organizations/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { addStatus, initializeStatus } from '../states/service';

export async function listForActiveOrganization(auth = {}) {
  const organizationId = requireActiveOrganization(auth);
  const partnerships = await repository.findByOrganization(organizationId);
  return Promise.all(partnerships.map(partnership => serializePartnership(partnership, auth, organizationId)));
}

export async function request({ partnerOrganizationId, auth = {} }) {
  const organizationId = requireActiveOrganization(auth);
  assertOrganizationAdmin(auth);

  const partnerId = String(partnerOrganizationId || '');
  if (!partnerId || partnerId === String(organizationId)) {
    throw createError({ statusCode: 400, message: 'Partner organization is required' });
  }
  const partner = await organizationsService.getById(partnerOrganizationId);
  if (!partner) throw createError({ statusCode: 404, message: 'Partner organization not found' });

  const existing = await repository.findBetween(organizationId, partnerId);
  if (existing) throw createError({ statusCode: 409, message: 'Partnership already exists' });

  const id = await repository.create({
    organizationIds: canonicalPair(organizationId, partnerId),
    requesterOrganizationId: String(organizationId),
    requesterUserId: String(auth.userId)
  });
  await initializeStatus('partnerships', id.toString(), auth.userId, 'Partnership requested');
  const partnership = await repository.findById(id);
  return serializePartnership(partnership, auth, organizationId);
}

export async function respond(partnershipId, auth = {}, action = 'accept') {
  const organizationId = requireActiveOrganization(auth);
  assertOrganizationAdmin(auth);

  const partnership = await loadPartnership(partnershipId);
  if (partnership.status !== 'pending') {
    throw createError({ statusCode: 409, message: 'Partnership is not pending' });
  }
  const isRequester = String(partnership.requesterOrganizationId) === String(organizationId);
  const isPartner = partnership.organizationIds.includes(String(organizationId)) && !isRequester;
  if (!isPartner) {
    throw createError({ statusCode: 403, message: 'Only the invited organization can respond' });
  }

  const status = action === 'accept' ? 'active' : 'declined';
  await repository.setStatus(partnership._id, status, { respondedAt: new Date() });
  await addStatus('partnerships', partnership._id.toString(), status, auth.userId, `Partnership ${status}`);
  const updated = await repository.findById(partnership._id);
  return serializePartnership(updated, auth, organizationId);
}

export async function terminate(partnershipId, auth = {}) {
  const organizationId = requireActiveOrganization(auth);
  assertOrganizationAdmin(auth);

  const partnership = await loadPartnership(partnershipId);
  if (!partnership.organizationIds.includes(String(organizationId))) {
    throw createError({ statusCode: 403, message: 'Partnership does not involve your organization' });
  }
  if (partnership.status === 'declined' || partnership.status === 'terminated') {
    throw createError({ statusCode: 409, message: 'Partnership is already closed' });
  }
  if (partnership.status === 'pending' && String(partnership.requesterOrganizationId) !== String(organizationId)) {
    throw createError({ statusCode: 403, message: 'Only the requesting organization can cancel' });
  }

  const status = partnership.status === 'active' ? 'terminated' : 'declined';
  await repository.setStatus(partnership._id, status, {
    terminatedAt: new Date(),
    terminatedByOrganizationId: String(organizationId)
  });
  await addStatus('partnerships', partnership._id.toString(), status, auth.userId, `Partnership ${status}`);
  return { success: true };
}

async function serializePartnership(partnership, auth, activeOrganizationId) {
  const partnerId = partnership.organizationIds.find(id => id !== String(activeOrganizationId))
    || String(activeOrganizationId);
  const [partner] = await organizationsService.getByIds([partnerId]).catch(() => []);
  const isRequester = String(partnership.requesterOrganizationId) === String(activeOrganizationId);
  return {
    _id: partnership._id.toString(),
    organizationIds: partnership.organizationIds,
    requesterOrganizationId: String(partnership.requesterOrganizationId),
    status: partnership.status,
    direction: isRequester ? 'outgoing' : 'incoming',
    createdAt: partnership.createdAt,
    respondedAt: partnership.respondedAt || null,
    terminatedAt: partnership.terminatedAt || null,
    partnerOrganization: partner
      ? { _id: String(partner._id || partner.id), name: partner.identity?.name || '', type: partner.data?.type || null }
      : { _id: partnerId, name: '', type: null }
  };
}

function canonicalPair(a, b) {
  return [String(a), String(b)].sort();
}

async function loadPartnership(partnershipId) {
  const partnership = await repository.findById(partnershipId);
  if (!partnership) throw createError({ statusCode: 404, message: 'Partnership not found' });
  return partnership;
}

function requireActiveOrganization(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (!auth.userId || !organizationId) {
    throw createError({ statusCode: 401, message: 'Organization context required' });
  }
  return organizationId;
}

function assertOrganizationAdmin(auth = {}) {
  if (!hasPermission(auth, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}
