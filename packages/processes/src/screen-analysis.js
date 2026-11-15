import { normalizeScreenContract } from './screen-contract.js';
import {
  normalizeProcessDefinition,
  compileLineageBindings,
  normalizeRoleCatalog,
  compileRoles,
  inferScreensFromRoleGrants,
  projectScreenForInferenceEquivalence,
  canonicalJson
} from './compiler-core.js';

export function redundantAuthoredScreens(process = {}, domain = {}, compiledRoles = {}, lineageBindings = []) {
  const authored = process.screens || {};
  if (!Object.keys(authored).length || !Object.keys(compiledRoles || {}).length) return [];
  const pureInferred = inferScreensFromRoleGrants({
    screens: {},
    roles: compiledRoles,
    domain,
    producerOutputs: process.producerOutputs || {},
    actions: process.actions || {},
    graph: process.graph || {},
    lineageBindings
  });
  const inferredByKey = new Map();
  for (const candidate of Object.values(pureInferred)) {
    const roleId = candidate.roleIds?.[0];
    if (!roleId || !candidate.typeId) continue;
    inferredByKey.set(
      `${roleId}:${candidate.typeId}:${candidate.template}`,
      projectScreenForInferenceEquivalence(normalizeScreenContract(candidate))
    );
  }
  const redundant = [];
  const seen = new Set();
  for (const [id, screen] of Object.entries(authored)) {
    if (!screen || typeof screen !== 'object') continue;
    const normalized = normalizeScreenContract(screen);
    const roleIds = normalized.roleIds?.length ? normalized.roleIds : Object.keys(compiledRoles);
    for (const roleId of roleIds) {
      const key = `${roleId}:${normalized.typeId}:${normalized.template}`;
      const inferredProjection = inferredByKey.get(key);
      if (!inferredProjection || seen.has(id)) continue;
      const projection = projectScreenForInferenceEquivalence({ ...normalized, roleIds: [roleId] });
      if (canonicalJson(projection) === canonicalJson(inferredProjection)) {
        seen.add(id);
        redundant.push({ id, roleId, typeId: normalized.typeId, template: normalized.template });
      }
    }
  }
  return redundant;
}

// Script-facing wrapper: the same detection over a raw definition and
// the organization role catalog, without a prior validation pass (the
// sweep must run on definitions whose slop would fail validation).
export function detectRedundantScreens(definition = {}, domain = {}, roles = {}) {
  const process = normalizeProcessDefinition(definition, domain);
  const lineageBindings = compileLineageBindings(process, domain);
  const organizationRoles = normalizeRoleCatalog(roles);
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings);
  return redundantAuthoredScreens(process, domain, compiledRoles, lineageBindings);
}

