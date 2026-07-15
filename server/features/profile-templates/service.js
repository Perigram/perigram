import { createError } from 'h3';
import { createData, createIdentity, createStatus, Lineage } from '../../core/blocks/index.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  createDefaultOccsProfileTemplateData,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '#utils/occs/profiles.js';
import * as cassetteService from '../cassettes/service.js';
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

function sameOrganization(left = {}, right = {}) {
  const leftOrg = left.lineage?.organization?.entityId?.toString?.() || left.lineage?.organization?.entityId || null;
  const rightOrg = right.lineage?.organization?.entityId?.toString?.() || right.lineage?.organization?.entityId || null;
  return Boolean(leftOrg && rightOrg && leftOrg.toString() === rightOrg.toString());
}

function currentUserOwns(profileTemplate = {}, scope = {}) {
  const ownerId = profileTemplate.lineage?.user?.entityId || null;
  return Boolean(ownerId && scope.userId && ownerId.toString() === scope.userId.toString());
}

function canAccess(profileTemplate = {}, scope = {}, auth = {}, level = 'read', accessEntity = null) {
  const ownerId = profileTemplate.lineage?.user?.entityId || null;
  const organizationId = profileTemplate.lineage?.organization?.entityId || null;
  if (!ownerId && !organizationId) return level === 'read';
  if (currentUserOwns(profileTemplate, scope)) return true;
  if (accessEntity) {
    return hasLineagePermission(auth, accessEntity, 'cassettes', level) && (
      sameOrganization(profileTemplate, accessEntity) ||
      currentUserOwns(profileTemplate, scope)
    );
  }
  return hasLineagePermission(auth, profileTemplate, 'cassettes', level);
}

function cassetteContextId(source = {}) {
  return source.cassetteTemplateId || source.cassetteId || source.templateId || source.template?._id || null;
}

async function resolveCassetteContext(source = {}, auth = {}, scope = {}, level = 'read') {
  const id = cassetteContextId(source);
  if (!id) return { scope, accessEntity: null };
  const cassette = await cassetteService.getById(id);
  if (!hasLineagePermission(auth, cassette, 'cassettes', level)) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }
  return {
    scope: {
      ...scope,
      organizationId: cassette.lineage?.organization?.entityId || scope.organizationId || null
    },
    accessEntity: cassette
  };
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

export async function listAll(auth = {}, filters = {}) {
  const context = await resolveCassetteContext(filters, auth, scopeFromAuth(auth), 'read');
  const scope = context.scope;
  const [systemProfiles, scopedProfiles] = await Promise.all([
    repository.findSystem(),
    repository.findByScope(scope)
  ]);
  const byId = new Map([...systemProfiles, ...scopedProfiles].map(profile => [profile._id.toString(), profile]));
  return [...byId.values()]
    .filter(profile => canAccess(profile, scope, auth, 'read', context.accessEntity))
    .map(profile => toDTO(profile));
}

export async function create(payload = {}, auth = {}) {
  const context = await resolveCassetteContext(payload, auth, scopeFromAuth(auth), 'write');
  const scope = context.scope;
  if (!payload.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  const data = normalizePayload(payload);
  const origin = createStatus('ACTIVE', scope.userId || 'SYSTEM', { note: 'Profile template created' });
  const created = await repository.create({
    identity: createIdentity(payload.name),
    origin,
    status: origin,
    lineage: new Lineage()
      .add('user', scope.userId)
      .add('organization', scope.organizationId),
    data: createData(data)
  });
  return toDTO(created);
}

export async function update(id, updates = {}, auth = {}) {
  const context = await resolveCassetteContext(updates, auth, scopeFromAuth(auth), 'write');
  const scope = context.scope;
  const current = await repository.findById(id);
  if (!current) throw createError({ statusCode: 404, message: 'Profile template not found' });
  if (!canAccess(current, scope, auth, 'write', context.accessEntity)) throw createError({ statusCode: 403, message: 'Access denied' });
  if (!current.lineage?.user?.entityId && !current.lineage?.organization?.entityId) {
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
  if (!profileTemplate.lineage?.user?.entityId && !profileTemplate.lineage?.organization?.entityId) {
    throw createError({ statusCode: 403, message: 'System profile templates cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
