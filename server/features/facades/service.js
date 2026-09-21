import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { createData, createIdentity } from '~/server/core/blocks/index.js';
import { createProcessUpdateHandler } from '~/server/features/_template/process-update-handler.js';
import * as artifactsService from '~/server/features/artifacts/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import * as repository from './repository.js';
import { Facade } from './model.js';
import { getLineageFilter, hasLineagePermission } from '~/server/utils/permissions.js';
import { statusService } from '~/server/core/machines/service.js';
import { generateRandomString } from '~/server/utils/strings.js';

const toDTO = raw => raw ? new Facade(raw).toJSON() : null;
const ref = (type, id) => id ? { type, id: String(id) } : null;

function normalizeAssignments(value = []) {
  if (!Array.isArray(value)) throw createError({ statusCode: 400, message: 'Facade assignments must be an array' });
  return value.map(item => ({
    partKey: String(item?.partKey || ''), patternId: item?.patternId ? String(item.patternId) : '', patternRevisionId: item?.patternRevisionId ? String(item.patternRevisionId) : '', libraryId: item?.libraryId ? String(item.libraryId) : '', cassetteId: item?.cassetteId ? String(item.cassetteId) : '', parameters: item?.parameters && typeof item.parameters === 'object' ? item.parameters : {}, mapping: item?.mapping?.mode === 'planar' ? { mode: 'planar' } : { mode: 'uv' }, placements: Array.isArray(item?.placements) ? item.placements : []
  })).filter(item => item.partKey && item.patternId);
}

async function ensureLayoutRevision(facade, userId, reason) {
  const revision = await entityRevisionsService.ensureForEntitySnapshot({ typeId: 'facade', entity: facade, scope: 'layout', content: { parts: facade.data?.parts || [], partAssignments: facade.data?.partAssignments || [] }, snapshot: { identity: facade.identity, data: facade.data }, userId, reason });
  const data = { ...facade.data, revisions: { ...(facade.data?.revisions || {}), layout: { currentId: revision._id, number: revision.data?.number || 0, contentHash: revision.data?.contentHash || '' } } };
  return await repository.updateById(facade._id, { data });
}

async function assertSourceModel(sourceModel, auth) {
  const sourceId = typeof sourceModel === 'object' ? sourceModel?.id : sourceModel;
  const artifact = await artifactsService.getById(sourceId, auth.userId, auth.organizationId, auth.role, auth);
  if (artifact.data?.type !== 'FACADE_MODEL_SOURCE') throw createError({ statusCode: 400, message: 'Facade source model must be a FACADE_MODEL_SOURCE artifact' });
  return artifact;
}

export async function create(input = {}, userId, userOrg, userRole, auth) {
  const lineage = input.lineage && typeof input.lineage === 'object' ? { ...input.lineage } : {};
  if (!lineage.organizationId) throw createError({ statusCode: 400, message: 'Facade organization lineage is required' });
  if (!lineage.projectId) throw createError({ statusCode: 400, message: 'Facade project lineage is required' });
  const origin = await statusService.initialStatusForOrganization('facade', lineage.organizationId, userId, { note: 'Facade created' });
  if (!hasLineagePermission(auth, { lineage, status: origin }, 'facades', 'write')) throw createError({ statusCode: 403, message: 'Permission denied for facades' });
  const source = input.relations?.sourceModel ? await assertSourceModel(input.relations.sourceModel, auth) : null;
  const name = input.name || 'New Facade';
  const created = await repository.create({ identity: createIdentity(name, `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`), origin, status: origin, lineage, relations: { sourceModel: source ? ref('artifact', source._id) : null, patterns: [], libraries: [] }, data: createData({ parts: [], partAssignments: [], revisions: {} }) });
  return toDTO(await ensureLayoutRevision(toDTO(created), userId, 'facade-created'));
}

export async function getById(id, userId, userOrg, userRole, auth) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Facade not found' });
  const facade = toDTO(raw);
  if (!hasLineagePermission(auth, facade, 'facades', 'read')) throw createError({ statusCode: 403, message: 'Permission denied for facades' });
  return facade;
}

export async function list(userId, userOrg, userRole, auth, query = {}) {
  const { limit, skip, ...filter } = query;
  if (filter.projectId) { filter['lineage.projectId'] = toFlexibleId(filter.projectId); delete filter.projectId; }
  const raws = await repository.find({ ...getLineageFilter(auth), ...filter }, { limit: Number(limit) || 100, skip: Number(skip) || 0 });
  return raws.map(toDTO).filter(item => hasLineagePermission(auth, item, 'facades', 'read'));
}

export async function update(id, input = {}, userId, userOrg, userRole, auth) {
  const current = await getById(id, userId, userOrg, userRole, auth);
  if (!hasLineagePermission(auth, current, 'facades', 'write')) throw createError({ statusCode: 403, message: 'Permission denied for facades' });
  const source = input.relations?.sourceModel ? await assertSourceModel(input.relations.sourceModel, auth) : null;
  const assignments = input.partAssignments === undefined ? current.data.partAssignments : normalizeAssignments(input.partAssignments);
  const parts = input.parts === undefined ? current.data.parts : Array.isArray(input.parts) ? input.parts : [];
  const relations = { ...(current.relations || {}), ...(source ? { sourceModel: ref('artifact', source._id) } : {}), patterns: [...new Map(assignments.map(item => [item.patternId, ref('facade_pattern', item.patternId)])).values()], libraries: [...new Map(assignments.filter(item => item.libraryId).map(item => [item.libraryId, ref('library', item.libraryId)])).values()] };
  const updated = await repository.updateById(id, { identity: { ...current.identity, ...(input.name ? { name: String(input.name) } : {}) }, relations, data: { ...current.data, parts, partAssignments: assignments } });
  return toDTO(await ensureLayoutRevision(toDTO(updated), userId, 'facade-updated'));
}

export async function remove(id, userId, userOrg, userRole, auth) {
  const facade = await getById(id, userId, userOrg, userRole, auth);
  if (!hasLineagePermission(auth, facade, 'facades', 'admin', { action: 'delete' })) throw createError({ statusCode: 403, message: 'Permission denied for facades' });
  return await repository.deleteById(id);
}

export const processUpdate = createProcessUpdateHandler({ typeId: 'facade', repository, Model: Facade });
