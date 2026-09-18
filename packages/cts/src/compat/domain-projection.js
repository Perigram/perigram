// Domain projection (SPEC §13/§15/§19, after the legacy cut): projects a
// CTS registry view onto the compiler-consumable domain shape — synthesis
// only. Every type in the view derives its entities entry, workflow,
// field schemas, field access, containment, construction, relations, and
// attachment kinds from its declaration. Nothing passes through from the
// base domain: legacy entity tables are not read. The base contributes
// operator contracts (commands/tasks/hooks), the framework canonical
// block vocabulary, UI metadata, and pack service registrations only.
//
// This is the single translator between the declaration layer and the
// process grammar — the designer and the compiler consume only this.
import { rowToFieldSchemas, slotFor } from './field-schema-rows.js';
import { renderPolicyFor } from '../render.js';

// Per-class instance collections (SPEC §13): the single home of the
// storage mapping; the server instance repository imports this map.
export const CLASS_COLLECTIONS = Object.freeze({
  file: 'files',
  item: 'items',
  group: 'groups',
  process: 'processes'
});

function camel(kebab = '') {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
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
  // The relations slot is the graph-authored association surface: its
  // entries are compiler-validated contracts (key, target type,
  // cardinality, target access), so the slot itself is writable.
  coreField('relations.value', 'relations', 'json'),
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

export function projectDomainFromView(registry, organizationId = null, baseDomain = {}, { packServices = null } = {}) {
  const view = registry.resolveView ? registry.resolveView(organizationId) : new Map();

  // The base contributes operator contracts, block vocabulary, UI
  // metadata, and pack services — never a domain catalog. Legacy entity
  // content on the base is dropped by construction.
  const {
    entities: _entities, workflows: _workflows, fieldSchemas: _fieldSchemas,
    fieldAccess: _fieldAccess, containment: _containment, construction: _construction,
    relations: _relations, attachmentKinds: _attachmentKinds, ...base
  } = baseDomain || {};

  // Authorable types: party types are framework auth principals and
  // `framework`-flagged machinery types are service-owned — neither
  // projects as an authorable instance.
  const types = [...view.values()].filter(type => type.class !== 'party' && !type.framework);

  // entities: one synthesized entry per view type, storage by class.
  const entities = types.map(type => {
    const usesSpecs = Object.values(type.fields || {}).some(descriptor => slotFor(descriptor, type.class) === 'specs');
    return {
      type: type.id,
      collection: CLASS_COLLECTIONS[type.class] || CLASS_COLLECTIONS.file,
      blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data',
        ...(usesSpecs ? ['specs'] : [])],
      meta: false
    };
  });

  // fieldSchemas: core slots + lineage-from-edges + rows per type.
  const rowEntriesByType = new Map(types.map(type => [type.id, rowToFieldSchemas(type.fields, type.class)]));
  const fieldAccess = {};
  const fieldSchemas = {};
  for (const type of types) {
    const rowEntries = rowEntriesByType.get(type.id) || [];
    const rowPaths = rowEntries.map(entry => entry.path);
    fieldAccess[type.id] = {
      feature: 'cts-types',
      read: ['_id', 'identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'summary.*',
        ...rowPaths],
      // Association writes travel through relations.<key> paths; their
      // keys, cardinality, and target access are compiler-validated
      // contracts, so the write policy grants the slot, not per-key rows.
      write: [...(rowPaths.length ? rowPaths : ['data.*']), 'relations.*'],
      admin: ['data.*', 'attachments.*']
    };
    const blocks = new Set(entities.find(entity => entity.type === type.id)?.blocks || []);
    const lineageFields = orgLineageFields(type, view);
    fieldSchemas[type.id] = [
      ...CORE_BLOCK_FIELDS.filter(field => blocks.has(field.block) || field.path === '_id'),
      ...lineageFields,
      ...rowEntries
    ].map(schema => withAccessFlags(schema, fieldAccess[type.id]));
  }

  // workflows: declared states/transitions with render policy (SPEC §7) —
  // labels/icons/severity are the single render home for declared states.
  const workflows = {};
  for (const type of types) {
    if (!type.states?.main?.values?.length) continue;
    const terminal = new Set(type.states.main.terminal || []);
    const render = renderPolicyFor(type);
    workflows[type.id] = {
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          label: 'Lifecycle',
          initial: type.states.main.initial,
          states: Object.fromEntries(type.states.main.values.map(value => [
            value,
            {
              ...(terminal.has(value) ? { isTerminal: true } : {}),
              canUpdateMeta: !terminal.has(value),
              ...(render.states[value]?.label ? { label: render.states[value].label } : {}),
              ...(render.states[value]?.icon ? { icon: render.states[value].icon } : {}),
              ...(render.states[value]?.severity ? { severity: render.states[value].severity } : {})
            }
          ])),
          transitions: (type.transitions || []).map(transition => ({
            from: transition.from,
            to: transition.to,
            ...(transition.intent ? { intent: transition.intent } : {})
          }))
        }
      }
    };
  }

  // containment: children edges rebuild the lineage contract; org edges
  // default to the camel-case key convention.
  const containment = [];
  for (const parent of types) {
    for (const declaration of Object.values(parent.edges?.children || {})) {
      for (const childType of declaration.types || []) {
        if (!view.has(childType)) continue;
        containment.push({
          parentType: parent.id,
          childType,
          lineageKey: declaration.lineageKey || `${camel(parent.id)}Id`
        });
      }
    }
  }

  // construction: genericCreate from declared rows (the composer-less
  // construct) plus declared construct operators as `via` modes with
  // signature-derived modeInputs.
  const construction = {};
  for (const type of types) {
    const constructOperators = Object.values(type.operators || {}).filter(operator => operator.species === 'construct');
    construction[type.id] = {
      modes: ['genericCreate', ...constructOperators.map(operator => operator.id)],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true },
        ...(rowEntriesByType.get(type.id) || [])
          .filter(schema => schema.constructible !== false)
          .map(schema => ({
            id: schema.path,
            label: schema.label || schema.path,
            path: schema.path,
            ...constructionInputKind(schema.type),
            required: schema.type?.nullable !== true,
            prompt: true
          }))
      ],
      ...(constructOperators.length ? {
        modeInputs: Object.fromEntries(constructOperators.map(operator => [operator.id, operatorModeInputs(operator)]))
      } : {})
    };
  }

  // relations: declared relation edges from every view type.
  const relations = [];
  for (const type of types) {
    for (const [key, declaration] of Object.entries(type.edges?.relations || {})) {
      for (const target of declaration.types || []) {
        relations.push({ ownerType: type.id, key, targetType: target, cardinality: 'many' });
      }
    }
  }

  // attachmentKinds: payload traits are the whole upload contract (SPEC
  // §4) — one upload-backed kind per payload-bearing type, keyed by type
  // id.
  const attachmentKinds = {};
  for (const type of types) {
    if (!type.payload) continue;
    const mime = [].concat(type.payload.mime || []);
    attachmentKinds[type.id] = {
      kind: type.id,
      mimeType: mime[0] || 'application/octet-stream',
      ...(type.payload.accept?.length ? { creation: { mode: 'upload', accept: type.payload.accept.join(',') } } : { creation: { mode: 'upload' } }),
      preview: { mode: type.payload.preview || 'download' },
      ...(Number.isFinite(type.payload.maxSize) ? { file: { maxBytes: type.payload.maxSize } } : {})
    };
  }

  // services: the operator registry — pack-registered services (SPEC §8 s
  // species) with their command bindings and declared signatures.
  const services = { ...(baseDomain?.serviceContracts || {}) };
  for (const service of (packServices || [])) {
    if (service?.id && service.command) {
      services[service.id] = service;
    }
  }

  return {
    ...base,
    entities,
    workflows,
    fieldAccess,
    fieldSchemas,
    containment,
    construction,
    relations,
    attachmentKinds,
    ...(Object.keys(services).length ? { serviceContracts: services } : {})
  };
}

// Lineage fields of one type: every children edge pointing at it
// contributes its key, recursively through ancestors in the same view.
function orgLineageFields(type, view, visited = new Set()) {
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
        type: { base: 'entityRef', shape: 'item', nullable: true, entityType: parent.id },
        writable: false,
        constructible: true
      });
      fields.push(...orgLineageFields(parent, view, nextVisited));
    }
  }
  return fields;
}

// A construct operator's signature record fields become construction mode
// inputs (the org-authored `via`): V descriptors translate to the domain
// input kinds at this seam — ref accepts become typed entity constraints,
// quantity stays a unit-bearing number, structural bases ride as object
// payloads. Required follows the row: a descriptor is required unless it
// declares itself nullable.
// Field-schema type -> construction input kind (the same seam
// operatorModeInputs uses for operator signatures): entity refs carry their
// typed constraint, everything structural rides as an object payload.
function constructionInputKind(type = {}) {
  if (type.base === 'entityRef' || type.base === 'entity') {
    return { type: 'entity', ...(type.entityType ? { entityType: type.entityType } : {}) };
  }
  if (['string', 'number', 'boolean'].includes(type.base)) return { type: type.base };
  if (type.base === 'dateTime' || type.base === 'date') return { type: 'date' };
  return { type: 'object' };
}

function operatorModeInputs(operator = {}) {
  const fields = operator.input?.base === 'record' ? operator.input.fields || {} : {};
  return Object.entries(fields).map(([name, descriptor]) => {
    const input = {
      id: name,
      label: name,
      path: name,
      required: descriptor.nullable !== true
    };
    if (descriptor.base === 'ref') {
      input.type = 'entity';
      if (descriptor.accepts?.length === 1) input.entityType = descriptor.accepts[0];
      else if (descriptor.accepts?.length) input.accepts = [...descriptor.accepts];
    } else if (descriptor.base === 'quantity') {
      input.type = 'number';
    } else if (descriptor.base === 'instant') {
      input.type = 'date';
    } else if (['string', 'number', 'boolean'].includes(descriptor.base)) {
      input.type = descriptor.base;
    } else {
      input.type = 'object';
    }
    return input;
  });
}
