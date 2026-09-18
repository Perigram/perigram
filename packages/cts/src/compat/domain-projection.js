// Domain projection (SPEC §13/§15/§19, source flip): projects a CTS
// registry view onto the compiler-consumable domain shape. This is the
// single translator between the declaration layer and the process
// grammar — the designer and the compiler consume only this.
//
// Ownership per key:
// - workflows: states/transitions from declarations; system types merge
//   legacy transition access and state flags by (from, to).
// - fieldSchemas: row fields synthesized back to block paths. System types
//   replace their data/specs legacy entries with row synthesis (equivalence
//   asserted by test); org types synthesize the core-slot convention plus
//   lineage fields from children edges plus their rows.
// - containment: children edges (with lineage keys) rebuild the lineage
//   contract for every type in the view.
// - relations: org-owned relation edges project; the declared remainder
//   passes through.
// - entities/fieldAccess: legacy entities stay authoritative for system
//   types (collections, routes, meta are storage metadata, not declarations);
//   org types append as first-class entries with a cts-types policy bound
//   to the real feature.
// - construction: system types keep the declared typed constructors
//   (service-bound operators, SPEC §8); org types get generic creation
//   (genericCreate + name prompt).
import { toTypeId } from './domain-cnc.js';
import { rowToFieldSchemas, slotFor } from './field-schema-rows.js';

function camel(kebab = '') {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function snake(id = '') {
  return id.replace(/-/g, '_');
}

const CORE_BLOCK_FIELDS = [
  coreField('_id', 'identity', 'json', { writable: false }),
  coreField('identity.uid', 'identity', 'string', { writable: false, constructible: false }),
  coreField('identity.name', 'identity', 'string'),
  coreField('identity.slug', 'identity', 'string'),
  coreField('identity.serial', 'identity', 'string'),
  coreField('identity.reference', 'identity', 'string'),
  coreField('origin.state.primary', 'origin', 'status', { writable: false, constructible: false }),
  coreField('origin.userId', 'origin', 'string', { writable: false, constructible: false }),
  coreField('origin.timestamp', 'origin', 'dateTime', { writable: false, constructible: false }),
  coreField('origin.metadata', 'origin', 'json', { writable: false, constructible: false }),
  coreField('origin.eventId', 'origin', 'string', { writable: false, constructible: false }),
  coreField('origin.lifecycle', 'origin', 'json', { writable: false, constructible: false }),
  coreField('status.state.primary', 'status', 'status', { constructible: false }),
  coreField('status.userId', 'status', 'string', { writable: false, constructible: false }),
  coreField('status.timestamp', 'status', 'dateTime', { writable: false, constructible: false }),
  coreField('status.metadata', 'status', 'json', { constructible: false }),
  coreField('status.eventId', 'status', 'string', { writable: false, constructible: false }),
  coreField('status.lifecycle', 'status', 'json', { writable: false, constructible: false }),
  coreField('lineage.organizationId', 'lineage', 'entityRef', { entityType: 'organization', writable: false, constructible: false }),
  coreField('relations.value', 'relations', 'json', { writable: false }),
  coreField('provenance.source', 'provenance', 'entityRef', { writable: false, constructible: false }),
  coreField('attachments.primary', 'attachments', 'json'),
  coreField('data.value', 'data', 'json'),
  coreField('summary.value', 'summary', 'json', { writable: false, constructible: false })
];

function coreField(path, block, base, flags = {}) {
  return {
    path,
    block,
    label: path,
    type: { base, shape: 'item', nullable: true },
    writable: flags.writable !== false,
    constructible: flags.constructible !== false,
    ...(flags.entityType ? { type: { base, shape: 'item', nullable: true, entityType: flags.entityType } } : {})
  };
}

function hasAccess(policy = {}, path = '', level = 'read') {
  const levels = level === 'read'
    ? ['read', 'write', 'admin']
    : ['write', 'admin'];
  const paths = levels.flatMap(access => policy[access] || []);
  return paths.some(pattern => (
    pattern === path
    || (pattern.endsWith('.*') && path.startsWith(pattern.slice(0, -1)))
  ));
}

function withAccessFlags(schema, policy) {
  return {
    ...schema,
    readable: hasAccess(policy, schema.path, 'read'),
    writable: schema.writable !== false && hasAccess(policy, schema.path, 'write')
  };
}

// field-access entries are keyed in any of snake/camel/kebab casing.
function accessPolicyFor(fieldAccess = {}, entityType = '') {
  const key = String(entityType || '');
  const camelKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const snakeKey = key.replace(/-/g, '_');
  return fieldAccess[key] || fieldAccess[camelKey] || fieldAccess[snakeKey] || {};
}

export function projectDomainFromView(registry, organizationId = null, baseDomain = {}, { packServices = null } = {}) {
  const view = registry.resolveView ? registry.resolveView(organizationId) : new Map();
  if (!view.size) return baseDomain;

  const legacyEntities = baseDomain.entities || [];
  const legacySnakeByKebab = new Map(legacyEntities.map(entity => [toTypeId(entity.type), entity.type]));

  const entityTypeFor = type => (type.scope === 'system' && legacySnakeByKebab.get(type.id)) || type.id;

  // entities: the view is authoritative. A system type with legacy entity
  // content keeps it (blocks, collections, routes stay real); org types and
  // pack-mounted types synthesize first-class entries. Legacy entity rows
  // outside the view are not projected — the pickers list types, not the
  // legacy catalog.
  const entities = [];
  const legacyByType = new Map(legacyEntities.map(entity => [entity.type, entity]));
  const rowEntriesByOrgType = new Map();
  for (const type of view.values()) {
    const legacyEntity = type.scope === 'system' ? legacyByType.get(entityTypeFor(type)) : null;
    if (legacyEntity) {
      entities.push(legacyEntity);
      continue;
    }
    const rowEntries = rowToFieldSchemas(type.fields, type.class);
    rowEntriesByOrgType.set(type.id, rowEntries);
    const entityType = type.id;
    const usesSpecs = Object.values(type.fields || {}).some(descriptor => slotFor(descriptor, type.class) === 'specs');
    entities.push({
      type: entityType,
      collection: `${snake(entityType)}s`,
      blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data',
        ...(usesSpecs ? ['specs'] : [])],
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
    // Merge legacy transition metadata by (from, to, intent); the bare
    // (from, to) fallback uses the FIRST legacy occurrence so duplicate
    // pairs (self-transitions with distinct intents) keep their own
    // metadata instead of inheriting the last duplicate's.
    const legacyByTriple = new Map();
    const legacyByPair = new Map();
    for (const transition of (legacyWorkflow?.regions?.main?.transitions || [])) {
      const pair = `${transition.from}>${transition.to}`;
      const triple = `${pair}>${transition.intent || ''}`;
      if (!legacyByTriple.has(triple)) legacyByTriple.set(triple, transition);
      if (!legacyByPair.has(pair)) legacyByPair.set(pair, transition);
    }
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
            legacyStates[value]
              // legacy state metadata is authoritative when present
              ? legacyStates[value]
              : {
                ...(terminal.has(value) ? { isTerminal: true } : {}),
                canUpdateMeta: !terminal.has(value)
              }
          ])),
          transitions: (type.transitions || []).map(transition => {
            const legacy = legacyByTriple.get(`${transition.from}>${transition.to}>${transition.intent || ''}`)
              || legacyByPair.get(`${transition.from}>${transition.to}`)
              || {};
            const projected = { ...legacy, from: transition.from, to: transition.to };
            if (transition.intent) projected.intent = transition.intent;
            else delete projected.intent;
            return projected;
          })
        }
      }
    };
  }

  // fieldAccess: system types keep legacy entries (their rows project
  // through the declared remainder); org types get a real entry bound to the
  // cts-types feature with row-derived paths.
  let fieldAccess = baseDomain.fieldAccess || {};
  for (const type of view.values()) {
    if (type.scope !== 'org') continue;
    if (fieldAccess === baseDomain.fieldAccess) fieldAccess = { ...fieldAccess };
    const rowPaths = (rowEntriesByOrgType.get(type.id) || []).map(entry => entry.path);
    fieldAccess[camel(type.id)] = {
      feature: 'cts-types',
      read: ['_id', 'identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'summary.*',
        ...rowPaths],
      write: rowPaths.length ? rowPaths : ['data.*'],
      admin: ['data.*', 'attachments.*']
    };
  }

  // fieldSchemas: system types replace their data/specs entries with row
  // synthesis (the collapse) and re-derive access flags from the declared
  // policy remainder; org types synthesize core slots + lineage-from-edges
  // + rows.
  // fieldSchemas: types in the synthesis map (org + pack declarations are
  // the only source) synthesize from rows; system types with legacy content
  // keep their legacy schemas during the transition.
  const fieldSchemas = {};
  for (const type of view.values()) {
    const entityType = entityTypeFor(type);
    if (type.scope === 'system' && !rowEntriesByOrgType.has(type.id) && (baseDomain.fieldSchemas?.[entityType] || []).length) {
      // legacy system type in the view: its schemas pass through with the
      // row synthesis overlaying the data/specs entries (the source flip)
      const legacy = baseDomain.fieldSchemas?.[entityType] || [];
      const policy = accessPolicyFor(baseDomain.fieldAccess || {}, entityType);
      const rowEntries = rowToFieldSchemas(type.fields, type.class).map(schema => withAccessFlags(schema, policy));
      const rowByPath = new Map(rowEntries.map(entry => [entry.path, entry]));
      const emitted = new Set();
      const projectedList = [];
      for (const entry of legacy) {
        if (rowByPath.has(entry.path)) {
          projectedList.push(rowByPath.get(entry.path));
          emitted.add(entry.path);
        } else {
          projectedList.push(entry);
        }
      }
      for (const entry of rowEntries) {
        if (!emitted.has(entry.path)) projectedList.push(entry);
      }
      fieldSchemas[entityType] = projectedList;
      continue;
    }
    // synthesis (org + pack types): core slots + lineage-from-edges + rows
    const policy = fieldAccess[camel(type.id)] || {};
    const orgBlocks = new Set(entities.find(entity => entity.type === entityType)?.blocks || []);
    const lineageFields = orgLineageFields(type, view, entityTypeFor);
    const synthesized = [
      ...CORE_BLOCK_FIELDS.filter(field => orgBlocks.has(field.block) || field.path === '_id'),
      ...lineageFields,
      ...(rowEntriesByOrgType.get(type.id) || [])
    ].map(schema => withAccessFlags(schema, policy));
    fieldSchemas[entityType] = synthesized;
  }

  // containment: children edges rebuild the lineage contract. Legacy keys
  // ride on system edges; org edges default to the camel-case convention.
  // Derivation containment (design -> product pairs, relations in CTS)
  // passes through from the declared remainder until relation readers
  // consume edges directly.
  const containment = [];
  const edgePairs = new Set();
  for (const parent of view.values()) {
    for (const declaration of Object.values(parent.edges?.children || {})) {
      for (const childType of declaration.types || []) {
        const child = view.get(childType);
        if (!child) continue;
        const parentEntity = entityTypeFor(parent);
        const childEntity = entityTypeFor(child);
        edgePairs.add(`${parentEntity}>${childEntity}`);
        containment.push({
          parentType: parentEntity,
          childType: childEntity,
          lineageKey: declaration.lineageKey || `${camel(parent.id)}Id`
        });
      }
    }
  }
  for (const relation of baseDomain.containment || []) {
    if (!edgePairs.has(`${relation.parentType}>${relation.childType}`)) {
      containment.push({ ...relation });
    }
  }

  // construction: system types keep the declared typed constructors
  // (service-bound, SPEC §8); org types get generic creation.
  let construction = baseDomain.construction || {};
  const legacyConstructionTypes = new Set(Object.keys(baseDomain.construction || {}));
  for (const type of view.values()) {
    const entityType = entityTypeFor(type);
    // org types and pack types without legacy construction synthesize
    // generic creation from their declarations
    const synthesizes = type.scope === 'org'
      || (type.class !== 'party' && !legacyConstructionTypes.has(entityType));
    if (!synthesizes) continue;
    if (construction === baseDomain.construction) construction = { ...construction };
    construction[type.id] = {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true }
      ]
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

  // services: the operator registry — pack-registered services (SPEC §8 s
  // species) with their command bindings and declared signatures; legacy
  // service contracts pass through during the transition.
  const services = { ...(baseDomain.serviceContracts || {}) };
  for (const service of (packServices || [])) {
    if (service?.id && service.command) {
      services[service.id] = service;
    }
  }

  return { ...baseDomain, entities, workflows, fieldAccess, fieldSchemas, containment, construction, relations, ...(Object.keys(services).length ? { serviceContracts: services } : {}) };
}

// Lineage fields of one org type: every children edge pointing at it
// contributes its key, recursively through ancestors in the same view.
function orgLineageFields(type, view, entityTypeFor, visited = new Set()) {
  if (visited.has(type.id)) return [];
  const nextVisited = new Set(visited).add(type.id);
  const fields = [];
  for (const parent of view.values()) {
    for (const [key, declaration] of Object.entries(parent.edges?.children || {})) {
      if (!(declaration.types || []).includes(type.id)) continue;
      const lineageKey = declaration.lineageKey || `${camel(parent.id)}Id`;
      fields.push({
        path: `lineage.${lineageKey}`,
        block: 'lineage',
        label: `lineage.${lineageKey}`,
        type: { base: 'entityRef', shape: 'item', nullable: true, entityType: entityTypeFor(parent) },
        writable: false,
        constructible: true
      });
      fields.push(...orgLineageFields(parent, view, entityTypeFor, nextVisited));
    }
  }
  return fields;
}
