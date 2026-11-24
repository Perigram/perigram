// Domain projection (SPEC §13/§15/§19, after the legacy cut): projects a
// CTS registry view onto the compiler-consumable domain shape — synthesis
// only. Every type in the view derives its entities entry, field
// schemas (the §13 wire DTO's own core vocabulary + rows), field access,
// containment, construction, relations, and attachment kinds from its
// declaration. Workflows are graph-derived and never projected (SPEC §7).
// Nothing passes through from the base domain: legacy entity tables are
// not read. The base contributes operator contracts
// (commands/tasks/hooks), the framework canonical block vocabulary, UI
// metadata, and pack service registrations only.
//
// This is the single translator between the declaration layer and the
// process grammar — the designer and the compiler consume only this.
import { rowToFieldSchemas } from './field-schema-rows.js';
import { ctsFieldToConstructionInput, legacyTypeToConstructionInput } from './process-grammar.js';
import { isRefDescriptor, refAcceptsOf } from './values.js';
import { lineageKeyForParent } from './edges.js';
import { renderPolicyFor } from './render.js';

// Per-class instance collections (SPEC §13): the single home of the
// storage mapping; the server instance repository imports this map.
export const CLASS_COLLECTIONS = Object.freeze({
  file: 'files',
  item: 'items',
  group: 'groups',
  process: 'processes'
});

// Create-dialog labels are authored vocabulary: a lineage input is named by
// its parent type's name, a row input by the start-cased row name;
// anything already carrying an authored label keeps it.
function constructionInputLabel({ path = '', label = '', typeId = '' } = {}, labelByType = new Map()) {
  const clean = String(path);
  if (clean.startsWith('lineage.')) {
    const parent = labelByType.get(typeId);
    if (parent) return parent;
  }
  const [, name] = clean.split('.');
  if (clean.startsWith('fields.') && name) {
    if (label && label !== clean) return label;
    return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }
  if (label && label !== clean) return label;
  return label || clean;
}

// Core fields are the §3 stored shape verbatim (wire decision 2026-10-11:
// the wire IS the stored document, ids JSON-safe) — nothing the instance
// services never store, nothing they store left unschema'd. There is no
// `identity` block, no `attachments.primary`, no tenancy-in-lineage, no
// data/specs slot split: `_id`/`name`/`organizationId`/`payload` travel as
// themselves and rows live in flat `fields`.
const CORE_BLOCK_FIELDS = [
  coreField('_id', 'identity', 'json', { writable: false }),
  coreField('type', 'identity', 'string', { writable: false, constructible: false }),
  coreField('typeVersion', 'identity', 'number', { writable: false, constructible: false }),
  coreField('organizationId', 'lineage', 'entityRef', { typeId: 'organization', writable: false, constructible: false }),
  coreField('name', 'identity', 'string'),
  coreField('state', 'status', 'status', { constructible: false }),
  coreField('stateChangedAt', 'status', 'dateTime', { writable: false, constructible: false }),
  coreField('createdAt', 'status', 'dateTime', { writable: false, constructible: false }),
  coreField('updatedAt', 'status', 'dateTime', { writable: false, constructible: false }),
  // §3 payload slot: the stored file reference, immutable through field
  // writes (replacement is the payload transport's concern).
  coreField('payload', 'attachments', 'json', { writable: false, constructible: false }),
  // §3 causal record, immutable after construct: op names the effect,
  // sources the typed inputs (refs), effective the replay-safety
  // parameters.
  coreField('provenance.op', 'provenance', 'string', { writable: false, constructible: false }),
  { ...coreField('provenance.sources', 'provenance', 'array', { writable: false, constructible: false }), type: { base: 'array', shape: 'item', nullable: true, itemType: { base: 'entityRef' } } },
  coreField('provenance.effective', 'provenance', 'json', { writable: false, constructible: false })
];

function coreField(path, block, base, flags = {}) {
  return {
    path,
    block,
    label: path,
    type: { base, shape: 'item', nullable: true },
    writable: flags.writable !== false,
    constructible: flags.constructible !== false,
    ...(flags.typeId ? { type: { base, shape: 'item', nullable: true, typeId: flags.typeId } } : {})
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

// Workflows are graph-derived, never type-projected (SPEC §7): state
// vocabularies live in process definitions as state nodes feeding create
// and transition sockets. The domain projection carries no workflows; the
// compiled process contract owns machines wherever a machine is needed.


// Declared relations of a type, from both authoring shapes: explicit
// `edges.relations` entries and ref fields whose `accepts` name the
// targets (the tree authors relations as ref fields). One entry per
// key/target pair, edges declared first. A ref row is always a declared
// relation (SPEC §6: the declared edge is the only legal ref storage).
function relationEntriesFor(type, view) {
  const entries = [];
  const seen = new Set();
  const push = (key, target, where = null, unlink = null, constructible = true, cardinality = 'one') => {
    const dedupe = `${key}:${target}`;
    if (seen.has(dedupe) || !view.has(target)) return;
    seen.add(dedupe);
    entries.push({
      key,
      target,
      cardinality: cardinality === 'many' ? 'many' : 'one',
      ...(where ? { where } : {}),
      ...(unlink ? { unlink } : {}),
      ...(constructible === false ? { constructible: false } : {})
    });
  };
  for (const [key, declaration] of Object.entries(type.edges?.relations || {})) {
    for (const target of declaration.types || []) {
      push(key, target, declaration.where || null, declaration.unlink || null, true, declaration.cardinality === 'one' ? 'one' : 'many');
    }
  }
  for (const [name, descriptor] of Object.entries(type.fields || {})) {
    if (!isRefDescriptor(descriptor)) continue;
    const cardinality = descriptor.base === 'list' ? 'many' : 'one';
    for (const target of refAcceptsOf(descriptor)) {
      push(name, target, descriptor.where || null, descriptor.unlink || null, descriptor.constructible, cardinality);
    }
  }
  return entries;
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

  // Authorable types: `framework`-flagged machinery types are
  // service-owned and never project. Party types (SPEC §13) project as
  // readable principals: read-only entities that join the process plane
  // as instance sources, relation targets, and decomposition inputs —
  // never as constructs, mutations, or lineage (the registry refuses
  // party children targets; the process compiler refuses party-bound
  // effects).
  const types = [...view.values()].filter(type => type.class !== 'party' && !type.framework);
  const partyTypes = [...view.values()].filter(type => type.class === 'party');

  // entities: one synthesized entry per view type, storage by class.
  // Party entities carry no class collection (their feature services own
  // storage) and are `meta` — administration surfaces, never inferred
  // screens.
  const entities = [
    ...types.map(type => (
      {
        type: type.id,
        // The authored name — the label every compiler and generator
        // surface uses; raw type ids never reach users. Declarations
        // without one (legacy org-stored) serve "Unnamed".
        label: renderPolicyFor(type).name || 'Unnamed',
        collection: CLASS_COLLECTIONS[type.class] || CLASS_COLLECTIONS.file,
        blocks: ['fields', 'lineage', 'relations'],
        meta: false
      }
    )),
    ...partyTypes.map(type => (
      {
        type: type.id,
        label: renderPolicyFor(type).name || 'Unnamed',
        collection: null,
        blocks: ['fields'],
        meta: true,
        party: true
      }
    ))
  ];

  // fieldSchemas: core slots + lineage-from-edges + rows per type.
  // A ref field's row entry lives at relations.<key> — the same path the
  // declared relation owns. The relation contract owns that path
  // exclusively; the colliding row entry is dropped so field schemas and
  // construction inputs expose ONE typed input per relation.
  const rowEntriesByType = new Map(types.map(type => {
    const relationRowPaths = new Set(relationEntriesFor(type, view).map(({ key }) => `fields.${key}`));
    const entries = rowToFieldSchemas(type.fields, type.class)
      .filter(entry => !relationRowPaths.has(entry.path));
    return [type.id, entries];
  }));
  const fieldAccess = {};
  const fieldSchemas = {};
  for (const type of types) {
    const rowEntries = rowEntriesByType.get(type.id) || [];
    const rowPaths = rowEntries.map(entry => entry.path);
    fieldAccess[type.id] = {
      feature: 'cts-types',
      // The §3 stored vocabulary: what the wire carries, nothing else.
      read: ['_id', 'type', 'typeVersion', 'organizationId', 'name', 'state', 'stateChangedAt', 'createdAt', 'updatedAt', 'payload',
        'lineage.*', 'relations.*', 'provenance.*',
        ...rowPaths],
      // Association writes travel through relations.<key> paths; their
      // keys, cardinality, and target access are compiler-validated
      // contracts, so the write policy grants the slot, not per-key rows.
      write: [...(rowPaths.length ? rowPaths : ['fields.*']), 'relations.*'],
      admin: ['fields.*']
    };
    const lineageFields = orgLineageFieldsDeep(type, view);

    // Declared relations — explicit edges and ref fields — are addressable
    // fields (SPEC §6): each key projects as ONE `relations.<key>` schema
    // so constructs receive them as construction inputs and mutates as
    // leaf sockets. A relation accepting several target types stays one
    // edge: the item reference carries the declared targets as `accepts`
    // (an entityRef expresses one type; the declaration remains the
    // acceptance authority).
    const relationFields = [];
    const relationByKey = new Map();
    for (const entry of relationEntriesFor(type, view)) {
      const relation = relationByKey.get(entry.key) || {
        targets: [],
        cardinality: entry.cardinality,
        constructible: true
      };
      relation.targets.push(entry.target);
      if (entry.cardinality === 'many') relation.cardinality = 'many';
      if (entry.constructible === false) relation.constructible = false;
      relationByKey.set(entry.key, relation);
    }
    for (const [key, relation] of relationByKey) {
      const targets = [...new Set(relation.targets)];
      const targetType = targets.length === 1 ? { typeId: targets[0] } : { accepts: targets };
      relationFields.push({
        path: `relations.${key}`,
        block: 'relations',
        label: targets.length === 1 ? (view.get(targets[0])?.name || key) : key,
        type: relation.cardinality === 'one'
          ? { base: 'entityRef', nullable: true, ...targetType }
          : { base: 'array', shape: 'item', nullable: true, itemType: { base: 'entityRef', ...targetType } },
        writable: true,
        constructible: relation.constructible
      });
    }
    fieldSchemas[type.id] = [
      ...CORE_BLOCK_FIELDS,
      ...lineageFields,
      ...relationFields,
      ...rowEntries
    ].map(schema => withAccessFlags(schema, fieldAccess[type.id]));
  }

  // Party field schemas (SPEC §13 readable principals): the identity
  // slots the party wire carries plus the declared rows — every slot
  // read-only. The party wire adapters expose exactly this vocabulary;
  // tenancy, lifecycle, payload, and edge slots do not exist for parties.
  for (const type of partyTypes) {
    const rows = rowToFieldSchemas(type.fields, type.class)
      .map(schema => ({ ...schema, writable: false, constructible: false }));
    const access = {
      read: ['_id', 'type', 'typeVersion', 'name', ...rows.map(row => row.path)],
      write: [],
      admin: []
    };
    fieldAccess[type.id] = access;
    fieldSchemas[type.id] = [
      coreField('_id', 'identity', 'json', { writable: false, constructible: false }),
      coreField('type', 'identity', 'string', { writable: false, constructible: false }),
      coreField('typeVersion', 'identity', 'number', { writable: false, constructible: false }),
      coreField('name', 'identity', 'string', { writable: false, constructible: false }),
      ...rows
    ].map(schema => withAccessFlags(schema, access));
  }

  // workflows: graph-derived, never projected (SPEC §7) — state
  // vocabularies live in process definitions; the compiled contract owns
  // machines.
  const workflows = {};

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
          // The declared storage key: stamped at edge normalize (SPEC §6).
          lineageKey: declaration.lineageKey || lineageKeyForParent(parent.id),
          // Org-authored children edges are the organization's own
          // hierarchy declaration; system pack containment is framework
          // opinion and stays non-authoritative for process placement.
          ...(parent.scope === 'org' ? { declared: 'org' } : {})
        });
      }
    }
  }

  // construction: payload-bearing types offer ONLY their declared
  // creation protocols (the editor protocol is the blank-create);
  // payload-less types offer genericCreate from declared rows (the
  // composer-less construct) plus declared construct operators as `via`
  // modes; derived types (operator/service-produced, SPEC §4) synthesize
  // no construction at all — they enter graphs as outputs. Protocol
  // modes carry mode inputs — upload/capture add the typed `file`
  // payload input; editor constructs blank. Lineage keys and declared
  // relation edges are construct-addressable (SPEC §6): the schemas were
  // built in the fieldSchemas pass above and are re-derived here per
  // type.
  const construction = {};

  function payloadProtocolModes(type) {
    return (type.payload?.creation || ['upload']);
  }

  // Construction prompts are the type's own vocabulary only — row fields
  // and addressable edges (SPEC §4 "not in the row means does not
  // exist"). Protocol modes prompt their protocol input alone; a record's
  // name arrives through an authored row, graph composition, the uploaded
  // file's name, or the identity rename channel.

  function protocolModeInputs(type, protocol) {
    const inputs = [];
    if (protocol === 'upload' || protocol === 'capture') {
      inputs.push({
        id: 'payload',
        label: 'File',
        path: 'payload',
        type: 'file',
        accept: (type.payload?.accept || type.payload?.mime || []).join(','),
        required: true,
        prompt: true,
        ...(protocol === 'capture' ? { capture: 'environment' } : {})
      });
      inputs.push(...operatorModeInputs({ input: { base: 'record', fields: type.payload?.inputs || {} } })
        .map(input => ({ ...input, prompt: true })));
    }
    if (protocol === 'content') {
      // The wired or prompted text becomes the payload at construct (SPEC
      // §4): a string construction input, pinned to the multiline control.
      inputs.push({
        id: 'content',
        label: 'Content',
        path: 'content',
        type: 'string',
        required: true,
        prompt: true,
        control: 'Textarea'
      });
    }
    return inputs;
  }

  function edgeFieldsFor(type) {
    const lineage = orgLineageFields(type, view);
    const relations = [];
    // One field per relation key: a multi-target relation is one edge
    // (ref fields and edges.relations both declare them).
    const relationsByKey = new Map();
    for (const { key, target, constructible, cardinality } of relationEntriesFor(type, view)) {
      const entry = relationsByKey.get(key) || { targets: [], constructible: true, cardinality: 'one' };
      entry.targets.push(target);
      if (constructible === false) entry.constructible = false;
      if (cardinality === 'many') entry.cardinality = 'many';
      relationsByKey.set(key, entry);
    }
    for (const [key, { targets, constructible, cardinality }] of relationsByKey) {
      const targetType = targets.length === 1 ? { typeId: targets[0] } : { accepts: targets };
      relations.push({
        path: `relations.${key}`,
        label: targets.length === 1 ? (view.get(targets[0])?.name || key) : key,
        type: cardinality === 'many'
          ? { base: 'array', shape: 'item', nullable: true, itemType: { base: 'entityRef', ...targetType } }
          : { base: 'entityRef', nullable: true, ...targetType },
        constructible
      });
    }
    return { lineage, relations };
  }
  for (const type of types) {
    // Derived types synthesize no construction: operator-produced
    // outputs are not constructible from a dialog. A payload-less type
    // whose construction is fully operator-shaped (declared construct
    // operators, SPEC §8) constructs through its operators only — the
    // generic row create is not offered for records that are meaningless
    // unoperated (cassette-design bakes; a bare row would carry no
    // geometry).
    if (type.derived) continue;
    const constructOperators = Object.values(type.operators || {}).filter(operator => operator.species === 'construct');
    const labelByType = new Map(entities.map(entity => [entity.type, entity.label]));
    const protocols = type.payload ? payloadProtocolModes(type) : [];
    construction[type.id] = {
      modes: [
        ...protocols,
        ...(!type.payload && !constructOperators.length ? ['genericCreate'] : []),
        ...constructOperators.map(operator => operator.id)
      ],
      defaultMode: type.payload
        ? protocols[0]
        : (constructOperators[0]?.id || 'genericCreate'),
      inputs: [
        // Immediate lineage axes and relation edges are
        // construct-addressable: a child type's parent key and declared
        // relation keys arrive as typed inputs where the entity begins;
        // ancestor axes derive at the construct seam (instances service).
        // Labels are authored vocabulary
        // (the parent type's name; the row's start-cased name) —
        // raw storage paths never reach a generated create dialog.
        ...(edgeFieldsFor(type).lineage)
          .filter(schema => schema.constructible !== false)
          .map(schema => ({
            id: schema.path,
            label: constructionInputLabel({
              path: schema.path,
              label: schema.label,
              typeId: schema.type?.typeId
            }, labelByType),
            path: schema.path,
            ...legacyTypeToConstructionInput(schema.type),
            required: false,
            prompt: true
          })),
        ...edgeFieldsFor(type).relations.map(schema => ({
          id: schema.path,
          label: constructionInputLabel({ path: schema.path, label: schema.label }, labelByType),
          path: schema.path,
          ...legacyTypeToConstructionInput(schema.type),
          required: false,
          prompt: true,
          ...(schema.constructible === false ? { constructible: false } : {})
        })),
        ...(rowEntriesByType.get(type.id) || [])
          .filter(schema => schema.constructible !== false)
          .map(schema => ({
            id: schema.path,
            label: constructionInputLabel({ path: schema.path, label: schema.label }, labelByType),
            path: schema.path,
            ...legacyTypeToConstructionInput(schema.type),
            required: schema.type?.nullable !== true,
            prompt: true
          }))
      ],
      ...((constructOperators.length || protocols.length) ? {
        modeInputs: {
          ...Object.fromEntries(constructOperators.map(operator => [operator.id, operatorModeInputs(operator)])),
          ...Object.fromEntries(protocols.map(protocol => [protocol, protocolModeInputs(type, protocol)]))
        }
      } : {})
    };
  }

  // relations: declared relation edges from every view type. The target
  // domain (`where`, SPEC §6) and the unlink policy ride the contract —
  // the domain enforced at every ref write and projected to pickers, the
  // policy executed by the compiled Unlink action.
  const relations = [];
  for (const type of types) {
    for (const entry of relationEntriesFor(type, view)) {
      relations.push({
        ownerType: type.id,
        key: entry.key,
        targetType: entry.target,
        cardinality: entry.cardinality,
        ...(entry.where ? { where: entry.where } : {}),
        ...(entry.unlink ? { unlink: entry.unlink } : {})
      });
    }
  }

  // projections: declared extract projections (SPEC §8 p) from every
  // view type, keyed '<typeId>/<projectionId>' — the projection
  // declaration owns its output type and its resolve (stored field path
  // or pack-mounted handler). The graph's extract reads resolve through
  // this map; nothing else may dereference a payload.
  const projectionContracts = {};
  for (const type of types) {
    for (const projection of (type.projections || [])) {
      if (!projection?.id || !projection.output || !projection.resolve) continue;
      projectionContracts[`${type.id}/${projection.id}`] = {
        typeId: type.id,
        id: projection.id,
        label: projection.label || projection.id,
        output: projection.output,
        resolve: projection.resolve,
        ...(projection.palette ? { palette: projection.palette } : {})
      };
    }
  }

  // attachmentKinds: payload traits are the whole upload contract (SPEC
  // §4) — one upload-backed kind per payload-bearing type, keyed by type
  // id. The creation mode is the type's first declared protocol.
  const attachmentKinds = {};
  for (const type of types) {
    if (!type.payload) continue;
    const mime = [].concat(type.payload.mime || []);
    const creationMode = (type.payload.creation || ['upload'])[0];
    attachmentKinds[type.id] = {
      kind: type.id,
      mimeType: mime[0] || 'application/octet-stream',
      ...(type.payload.accept?.length ? { creation: { mode: creationMode, accept: type.payload.accept.join(',') } } : { creation: { mode: creationMode } }),
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
    ...(Object.keys(projectionContracts).length ? { projectionContracts } : {}),
    ...(Object.keys(services).length ? { serviceContracts: services } : {})
  };
}

// Immediate lineage axes of one type: every children edge pointing at it
// contributes its key. Ancestor axes are read-model vocabulary alone —
// the construct seam derives the stored chain from the referenced
// parents (instances service, §3).
function orgLineageFields(type, view) {
  const fields = [];
  for (const parent of view.values()) {
    for (const [key, declaration] of Object.entries(parent.edges?.children || {})) {
      if (!(declaration.types || []).includes(type.id)) continue;
      const lineageKey = declaration.lineageKey || lineageKeyForParent(parent.id);
      fields.push({
        path: `lineage.${lineageKey}`,
        block: 'lineage',
        label: `lineage.${lineageKey}`,
        type: { base: 'entityRef', shape: 'item', nullable: true, typeId: parent.id },
        writable: false,
        constructible: true
      });
    }
  }
  return fields;
}

// The read model's lineage block: immediate axes plus every ancestor
// axis, recursively (filters, access facts, and breadcrumbs address the
// whole chain).
function orgLineageFieldsDeep(type, view, visited = new Set()) {
  if (visited.has(type.id)) return [];
  const nextVisited = new Set(visited).add(type.id);
  const fields = [...orgLineageFields(type, view)];
  for (const parent of view.values()) {
    const parentsThis = Object.values(parent.edges?.children || {})
      .some(declaration => (declaration.types || []).includes(type.id));
    if (parentsThis) fields.push(...orgLineageFieldsDeep(parent, view, nextVisited));
  }
  return fields;
}

// A construct operator's signature record fields become construction mode
// inputs (the org-authored `via`): the descriptor translation lives in the
// process adapter (`ctsFieldToConstructionInput`). Required follows the row:
// a descriptor is required unless it declares itself nullable.
function operatorModeInputs(operator = {}) {
  const fields = operator.input?.base === 'record' ? operator.input.fields || {} : {};
  return Object.entries(fields).map(([name, descriptor]) => {
    const input = {
      id: name,
      label: descriptor.label || name,
      path: name,
      required: descriptor.nullable !== true,
      // The naming facet's control pin rides verbatim (SPEC §4): the
      // dialog decides how a ref input is picked, the type stays the type.
      ...(descriptor.control ? { control: descriptor.control } : {}),
      ...(descriptor.controlOptions ? { controlOptions: descriptor.controlOptions } : {}),
      ...ctsFieldToConstructionInput(descriptor)
    };
    return input;
  });
}
