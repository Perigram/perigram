// Type lifetime (cts SPEC §4, owner decision 2026-10-13): an org type
// lives while any stored process definition's current graph declares it —
// active, draft, or turned off. The apply that orphans a type and the
// deletion of its last declaring definition kill it WITH its data, behind
// an explicit disclaimer (the manifest this module computes). History
// snapshots keep their declaration copies for restore but do not keep a
// type alive. Deliberately repository-level: importing the
// process-definitions SERVICE here would cycle (it already imports this
// feature's service).
import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as repository from './repository.js';
import { find as findDefinitions } from '../process-definitions/repository.js';
import { countInstancesOfType } from '../instances/count.js';
import { purgeInstancesOfType } from '../instances/purge.js';
import { publishOrgContractChanged } from '../instance-events/service.js';

function declaredTypeIdsOf(definitionData = {}) {
  return Object.values(definitionData?.ctsTypes || {})
    .filter(record => record?.kind === 'class')
    .map(record => String(record.typeId || '').trim())
    .filter(Boolean);
}

// Candidates: stored org types declared by NO stored definition (the
// caller may exclude the definition being deleted — its declarations die
// with it, so they do not keep anything alive).
export async function findTypeDeathCandidates({ organizationId, ignoringDefinitionId = null } = {}) {
  if (!organizationId) return [];
  const stored = await repository.listByOrganization(organizationId);
  if (!stored.length) return [];
  const definitions = await findDefinitions({ 'lineage.organizationId': toFlexibleId(organizationId) });
  const declared = new Set();
  for (const definition of definitions) {
    if (ignoringDefinitionId && String(definition._id) === String(ignoringDefinitionId)) continue;
    for (const typeId of declaredTypeIdsOf(definition.data)) declared.add(typeId);
  }
  return stored.filter(type => !declared.has(String(type.id)));
}

// The disclaimer's payload: one row per dying type, labeled by its
// authored name, with the live instance count.
export async function typeDeathManifest(candidates = [], organizationId = null) {
  const manifest = [];
  for (const type of candidates) {
    manifest.push({
      typeId: String(type.id),
      name: type.name || String(type.id),
      class: type.class || 'file',
      instances: await countInstancesOfType(String(type.id), organizationId)
    });
  }
  return manifest;
}

// The confirmed death: declaration, instances, status history, and stored
// files leave together; the registry view and derived indexes refresh
// once after the sweep.
export async function killTypesWithData(manifest = [], { organizationId, actor = 'SYSTEM' } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const deaths = [];
  for (const entry of manifest) {
    const purged = await purgeInstancesOfType(entry.typeId, organizationId, entry.class);
    await repository.deleteByTypeId(organizationId, entry.typeId);
    deaths.push({ ...entry, purged, actor, at: new Date().toISOString() });
    publishOrgContractChanged(String(organizationId), 'registry', {
      typeId: entry.typeId,
      killed: true,
      instances: purged.instances
    });
  }
  return deaths;
}
