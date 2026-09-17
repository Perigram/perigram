// Domain projection (SPEC §13, collapse direction): projects a CTS registry
// view BACK onto the compiler-consumable domain shape, overriding the keys
// the collapse owns (workflows, entities, fieldAccess for org types, org
// relations) and passing everything else through from the base domain.
// This closes the loop: domain-cnc code -> CTS records -> compiled runtime.
//
// Honest limits, by design:
// - system types keep their legacy workflow access/policy (CTS policy is
//   deferred, SPEC §10); only the SHAPE comes from CTS — merged with legacy
//   transition access by (from, to) pair.
// - org-type transitions carry no access until the policy facet lands.
// - org-type field access binds to the real `cts-types` feature.
import { toTypeId } from './domain-cnc.js';

function camel(kebab = '') {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function snake(id = '') {
  return id.replace(/-/g, '_');
}

export function projectDomainFromView(registry, organizationId = null, baseDomain = {}) {
  const view = registry.resolveView ? registry.resolveView(organizationId) : new Map();
  if (!view.size) return baseDomain;

  const legacyEntities = baseDomain.entities || [];
  const legacySnakeByKebab = new Map(legacyEntities.map(entity => [toTypeId(entity.type), entity.type]));

  const entityTypeFor = type => (type.scope === 'system' && legacySnakeByKebab.get(type.id)) || type.id;

  // entities: legacy list is authoritative for system types (blocks,
  // collections, routes stay real); org types append as first-class entries.
  const entities = [...legacyEntities];
  const seen = new Set(legacyEntities.map(entity => entity.type));
  for (const type of view.values()) {
    if (type.scope !== 'org') continue;
    const entityType = type.id;
    if (seen.has(entityType)) continue;
    entities.push({
      type: entityType,
      collection: `${snake(entityType)}s`,
      blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data'],
      meta: false
    });
  }

  // workflows: CTS states/transitions project to the v2 shape; transition
  // access merges from the legacy workflow by (from, to) when present.
  const workflows = { ...(baseDomain.workflows || {}) };
  for (const type of view.values()) {
    if (!type.states?.main?.values?.length) continue;
    const legacyId = entityTypeFor(type);
    const legacyWorkflow = baseDomain.workflows?.[legacyId];
    const legacyAccess = new Map((legacyWorkflow?.regions?.main?.transitions || [])
      .map(transition => [`${transition.from}>${transition.to}`, transition]));
    const legacyStates = legacyWorkflow?.regions?.main?.states || {};
    const terminal = new Set(type.states.main.terminal || []);
    workflows[legacyId] = {
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          label: 'Lifecycle',
          initial: type.states.main.initial,
          states: Object.fromEntries(type.states.main.values.map(value => [
            value,
            {
              ...(legacyStates[value] || {}),
              ...(terminal.has(value) ? { isTerminal: true } : {}),
              canUpdateMeta: legacyStates[value]?.canUpdateMeta ?? !terminal.has(value)
            }
          ])),
          transitions: (type.transitions || []).map(transition => {
            const legacy = legacyAccess.get(`${transition.from}>${transition.to}`) || {};
            const projected = { ...legacy, from: transition.from, to: transition.to };
            if (transition.intent) projected.intent = transition.intent;
            return projected;
          })
        }
      }
    };
  }

  // fieldAccess: system types keep legacy entries (their CTS rows are the
  // quarantined strangler rows); org types get a real entry bound to the
  // cts-types feature with row-derived data paths.
  const fieldAccess = { ...(baseDomain.fieldAccess || {}) };
  for (const type of view.values()) {
    if (type.scope !== 'org') continue;
    const rowFields = Object.entries(type.fields || {})
      .filter(([, descriptor]) => descriptor.base !== 'json')
      .map(([name]) => `data.${name}`);
    fieldAccess[camel(type.id)] = {
      feature: 'cts-types',
      read: ['_id', 'identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'summary.*',
        ...(rowFields.length ? rowFields : ['data.*'])],
      write: rowFields.length ? rowFields : ['data.*'],
      admin: ['data.*', 'attachments.*']
    };
  }

  // relations: legacy stays; org-owned relations project from declared edges.
  const relations = [...(baseDomain.relations || [])];
  const legacyRelationKeys = new Set(relations.map(relation => `${relation.ownerType}:${relation.key}`));
  for (const type of view.values()) {
    if (type.scope !== 'org') continue;
    for (const [key, declaration] of Object.entries(type.edges?.relations || {})) {
      for (const target of declaration.types || []) {
        const relationKey = `${type.id}:${key}`;
        if (legacyRelationKeys.has(relationKey)) continue;
        relations.push({ ownerType: type.id, key, targetType: target, cardinality: 'many' });
      }
    }
  }

  return { ...baseDomain, entities, workflows, fieldAccess, relations };
}
