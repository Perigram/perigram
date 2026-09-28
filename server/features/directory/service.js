import { createError } from 'h3';
import * as usersService from '../users/service.js';
import * as organizationsService from '../organizations/service.js';

const SEARCH_RESULT_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;
const DIRECTORY_TYPES = ['user', 'organization'];

export async function search(auth, { q = '', types = DIRECTORY_TYPES } = {}) {
  assertAuthenticated(auth);
  const query = String(q || '').trim().toLowerCase();
  if (query.length < MIN_QUERY_LENGTH) return emptyGroups();

  const requested = normalizeTypes(types);
  const groups = await Promise.all(requested.map(async (type) => {
    const entities = type === 'user'
      ? await usersService.directorySearch(query, SEARCH_RESULT_LIMIT)
      : await organizationsService.directorySearch(query, SEARCH_RESULT_LIMIT);
    return {
      type,
      results: entities.map(entity => projectCard(type, entity, auth))
    };
  }));
  return { query, groups };
}

export async function getEntry(auth, type, id) {
  assertAuthenticated(auth);
  const normalizedType = String(type || '').toLowerCase();
  if (!DIRECTORY_TYPES.includes(normalizedType)) {
    throw createError({ statusCode: 400, message: 'Unsupported directory type' });
  }
  const entity = normalizedType === 'user'
    ? await usersService.getById(id)
    : await organizationsService.getById(id);
  if (!entity) throw createError({ statusCode: 404, message: 'Not found' });
  return projectCard(normalizedType, entity, auth);
}

function projectCard(type, entity, auth) {
  const id = String(entity._id || entity.id || '');
  // The users model computes `data.avatarUrl` only in `toJSON()` (stored
  // avatar storage metadata never leaves the feature), so cards read the
  // serialized shape.
  const source = entity?.toJSON ? entity.toJSON() : entity;
  const card = {
    type,
    _id: id,
    identity: { name: source.identity?.name || '' }
  };
  if (type === 'user') {
    card.data = { avatarUrl: source.data?.avatarUrl || null };
    card.directory = {
      isSelf: id === String(auth.userId || ''),
      sharesOrganization: userSharesOrganization(entity, auth)
    };
  } else {
    card.data = { type: source.data?.type || null };
    card.directory = {
      isMember: organizationIdsOfAuth(auth).has(id)
    };
  }
  return card;
}

function userSharesOrganization(entity, auth) {
  const authOrgs = organizationIdsOfAuth(auth);
  return (entity.data?.memberships || []).some(membership =>
    authOrgs.has(String(membership.organizationId || ''))
  );
}

function organizationIdsOfAuth(auth = {}) {
  const ids = [
    ...(auth.memberships || []).map(membership => String(membership.organizationId || '')),
    String(auth.organizationId || '')
  ].filter(Boolean);
  return new Set(ids);
}

function normalizeTypes(types) {
  const requested = Array.isArray(types)
    ? types
    : String(types || '').split(',');
  const normalized = requested.map(type => String(type || '').trim().toLowerCase());
  const valid = DIRECTORY_TYPES.filter(type => normalized.includes(type));
  return valid.length ? valid : DIRECTORY_TYPES;
}

function emptyGroups() {
  return { query: '', groups: DIRECTORY_TYPES.map(type => ({ type, results: [] })) };
}

function assertAuthenticated(auth = {}) {
  if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
}
