import { createError } from 'h3';
import { createData, createIdentity, createStatus } from '../../core/blocks/index.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  createDefaultOccsProfileTemplateData,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '#utils/occs/profiles.js';
import { hasLineagePermission } from '../../utils/permissions.js';
import { ProfileTemplate } from './model.js';
import * as repository from './repository.js';

function toDTO(profileTemplate) {
  if (!profileTemplate) return null;
  return {
    ...new ProfileTemplate(profileTemplate).toJSON(),
    _id: profileTemplate._id
  };
}

function scopeFromAuth(auth = {}) {
  const membershipOrganizationId = auth.memberships?.[0]?.organizationId || null;
  return {
    userId: auth.userId || auth?.context?.auth?.userId || null,
    organizationId: auth.organizationId || auth.orgId || auth?.context?.auth?.organizationId || membershipOrganizationId || null
  };
}

function profileAccessEntity(profileTemplate = {}, scope = {}) {
  return {
    ...profileTemplate,
    lineage: {
      ...(profileTemplate.lineage || {}),
      organizationId: profileTemplate.lineage?.organizationId || scope.organizationId || null
    }
  };
}

function canAccess(profileTemplate = {}, scope = {}, auth = {}, level = 'read') {
  const ownerId = profileTemplate.lineage?.userId || null;
  const organizationId = profileTemplate.lineage?.organizationId || null;
  if (!ownerId && !organizationId) return level === 'read';
  return hasLineagePermission(auth, profileAccessEntity(profileTemplate, scope), 'cassettes', level);
}

function normalizePayload(payload = {}) {
  const defaults = createDefaultOccsProfileTemplateData(payload);
  const kind = OCCS_PROFILE_KINDS.includes(payload.kind) ? payload.kind : defaults.kind;
  const process = OCCS_PROFILE_PROCESSES.includes(payload.process) ? payload.process : defaults.process;
  const parameters = {
    ...defaults.parameters,
    ...(payload.parameters || payload.data?.parameters || {})
  };
  const sketch = normalizeOccsProfileSketch(payload.sketch || payload.data?.sketch || defaults.sketch, parameters);
  return {
    kind,
    process,
    parameters,
    sketch,
    occsProfile: occsProfileFromSketch(sketch, { parameters }),
    description: payload.description || payload.data?.description || ''
  };
}

export async function getById(id, auth = {}) {
  const scope = scopeFromAuth(auth);
  const profileTemplate = await repository.findById(id);
  if (!profileTemplate) {
    throw createError({ statusCode: 404, message: 'Profile template not found' });
  }
  if (!canAccess(profileTemplate, scope, auth, 'read')) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return toDTO(profileTemplate);
}

export async function listAll(auth = {}) {
  const scope = scopeFromAuth(auth);
  const [systemProfiles, scopedProfiles] = await Promise.all([
    repository.findSystem(),
    repository.findByScope(scope)
  ]);
  const byId = new Map([...systemProfiles, ...scopedProfiles].map(profile => [profile._id.toString(), profile]));
  return [...byId.values()]
    .filter(profile => canAccess(profile, scope, auth, 'read'))
    .map(toDTO);
}

export async function create(payload = {}, auth = {}) {
  const scope = scopeFromAuth(auth);
  if (!payload.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  if (!hasLineagePermission(auth, { lineage: { organizationId: scope.organizationId } }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }
  const data = normalizePayload(payload);
  const origin = createStatus('ACTIVE', scope.userId || 'SYSTEM', { note: 'Profile template created' });
  const created = await repository.create({
    identity: createIdentity(payload.name),
    origin,
    status: origin,
    lineage: {
      userId: scope.userId,
      organizationId: scope.organizationId
    },
    data: createData(data)
  });
  return toDTO(created);
}

export async function update(id, updates = {}, auth = {}) {
  const scope = scopeFromAuth(auth);
  const current = await repository.findById(id);
  if (!current) throw createError({ statusCode: 404, message: 'Profile template not found' });
  if (!canAccess(current, scope, auth, 'write')) throw createError({ statusCode: 403, message: 'Access denied' });
  if (!current.lineage?.userId && !current.lineage?.organizationId) {
    throw createError({ statusCode: 403, message: 'System profile templates cannot be modified' });
  }

  const nextData = normalizePayload({
    ...current.data,
    ...(updates.data || {}),
    ...updates
  });
  const identity = { ...(current.identity || {}) };
  if (updates.name) identity.name = updates.name;

  await repository.updateById(id, {
    identity,
    data: nextData
  });
  return await getById(id, auth);
}

export async function remove(id, auth = {}) {
  const scope = scopeFromAuth(auth);
  const profileTemplate = await getById(id, auth);
  if (!canAccess(profileTemplate, scope, auth, 'admin')) throw createError({ statusCode: 403, message: 'Access denied' });
  if (!profileTemplate.lineage?.userId && !profileTemplate.lineage?.organizationId) {
    throw createError({ statusCode: 403, message: 'System profile templates cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
