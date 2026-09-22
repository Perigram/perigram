import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { createData, createIdentity } from '~/server/core/blocks/index.js';
import { createProcessUpdateHandler } from '~/server/features/_template/process-update-handler.js';
import * as instanceRevisionsService from '~/server/features/instance-revisions/service.js';
import * as repository from './repository.js';
import { FacadePattern } from './model.js';
import { getLineageFilter, hasLineagePermission } from '~/server/utils/permissions.js';
import { statusService } from '~/server/core/machines/service.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { generateRandomString } from '~/server/utils/strings.js';
import { validateFacadePatternGraph } from '~/utils/facade-patterns/index.js';

const toDTO = raw => raw ? new FacadePattern(raw).toJSON() : null;
const emptyGraph = () => ({ schemaVersion: 1, nodes: [], edges: [], outputs: [], parameters: [] });

function normalizeGraph(graph) {
  const next = graph && typeof graph === 'object' ? graph : emptyGraph();
  const issues = validateFacadePatternGraph(next);
  if (issues.length) throw createError({ statusCode: 400, message: issues.join('; ') });
  return { schemaVersion: 1, nodes: Array.isArray(next.nodes) ? next.nodes : [], edges: Array.isArray(next.edges) ? next.edges : [], outputs: Array.isArray(next.outputs) ? next.outputs : [], parameters: Array.isArray(next.parameters) ? next.parameters : [] };
}
async function ensureAlgorithmRevision(pattern, userId, reason) {
  const revision = await instanceRevisionsService.ensureForEntitySnapshot({ typeId: 'facade_pattern', entity: pattern, scope: 'algorithm', content: { graph: pattern.data?.graph || emptyGraph() }, snapshot: { identity: pattern.identity, data: { graph: pattern.data?.graph || emptyGraph() } }, userId, reason });
  return await repository.updateById(pattern._id, { data: { ...pattern.data, revisions: { ...(pattern.data?.revisions || {}), algorithm: { currentId: revision._id, number: revision.data?.number || 0, contentHash: revision.data?.contentHash || '' } } } });
}
export async function create(input = {}, userId, userOrg, userRole, auth) {
  const organizationId = toFlexibleId(input.organizationId || userOrg);
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const origin = await statusService.initialStatusForOrganization('facade_pattern', organizationId, userId, { note: 'Facade pattern created' });
  const lineage = { organizationId };
  if (!hasLineagePermission(auth, { lineage, status: origin }, 'facade_patterns', 'write')) throw createError({ statusCode: 403, message: 'Permission denied for facade patterns' });
  const name = input.name || 'New Facade Pattern';
  const created = await repository.create({ identity: createIdentity(name, `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`), origin, status: origin, lineage, relations: { libraries: [] }, data: createData({ graph: normalizeGraph(input.graph), revisions: {} }) });
  return toDTO(await ensureAlgorithmRevision(toDTO(created), userId, 'pattern-created'));
}
export async function getById(id, userId, userOrg, userRole, auth) { const raw = await repository.findById(id); if (!raw) throw createError({ statusCode: 404, message: 'Facade pattern not found' }); const item = toDTO(raw); if (!hasLineagePermission(auth, item, 'facade_patterns', 'read')) throw createError({ statusCode: 403, message: 'Permission denied for facade patterns' }); return item; }
export async function list(userId, userOrg, userRole, auth, query = {}) { const { limit, skip, ...filter } = query; const raws = await repository.find({ ...getLineageFilter(auth), ...filter }, { limit: Number(limit) || 100, skip: Number(skip) || 0 }); return raws.map(toDTO).filter(item => hasLineagePermission(auth, item, 'facade_patterns', 'read')); }
export async function update(id, input = {}, userId, userOrg, userRole, auth) { const current = await getById(id, userId, userOrg, userRole, auth); if (!hasLineagePermission(auth, current, 'facade_patterns', 'write')) throw createError({ statusCode: 403, message: 'Permission denied for facade patterns' }); const graph = input.graph === undefined ? current.data.graph : normalizeGraph(input.graph); const updated = await repository.updateById(id, { identity: { ...current.identity, ...(input.name ? { name: String(input.name) } : {}) }, data: { ...current.data, graph } }); return toDTO(await ensureAlgorithmRevision(toDTO(updated), userId, 'pattern-updated')); }
export async function remove(id, userId, userOrg, userRole, auth) { const item = await getById(id, userId, userOrg, userRole, auth); if (!hasLineagePermission(auth, item, 'facade_patterns', 'admin', { action: 'delete' })) throw createError({ statusCode: 403, message: 'Permission denied for facade patterns' }); return await repository.deleteById(id); }
export const processUpdate = createProcessUpdateHandler({ typeId: 'facade_pattern', repository, Model: FacadePattern });
