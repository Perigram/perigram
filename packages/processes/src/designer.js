import { CANONICAL_ENTITY_BLOCKS } from '@perigram/core';
import { PRODUCER_ORIGIN_SPECIES_KINDS, TYPE_BOUND_SPECIES, carriesTypePin } from './node-catalog.js';
import { operationKindOf, describeType, normalizeOperator, normalizeType, typeIdOf, ctsFieldToProcessType, declarationsFromCtsRecords, rowFieldId, isRefDescriptor, refAcceptsOf } from '@perigram/cts';
// Single vocabulary seam: the species/operation table is re-exported, never
// imported from the type system package directly by app surfaces.
export { operationKindOf };
import { resolveCtsDefinition, checkCtsGraphBindings, isCtsGraphDefinition, classMayDeclareChildren, rowRelativeFieldId } from '@perigram/cts';
import { processType } from './types.js';

// The one trigger-mode derivation: the wire wins; an unwired entry with an
// authored schedule starts at its time, one with an authored eventId
// starts on that event.
export function effectTriggerFor(wired, record = {}) {
  if (wired) return { mode: 'event' };
  if (record.trigger?.schedule?.at || record.trigger?.schedule?.interval) {
    return { mode: 'schedule', schedule: record.trigger.schedule };
  }
  if (record.eventId) return { mode: 'event', eventId: record.eventId };
  return { mode: 'manual' };
}

// Per-state field policy (SPEC §7 `fieldPolicy`, §10): whitelists over the
// bound type's row. An absent facet or list leaves that axis unrestricted;
// an authored empty list allows nothing. List ids adopt the row-relative
// form — a block-prefixed spelling (`fields.x`) is the bare row id.
export function normalizeStateFieldPolicy(fieldPolicy = null) {
  if (!fieldPolicy || typeof fieldPolicy !== 'object' || Array.isArray(fieldPolicy)) return null;
  const list = value => Array.isArray(value)
    ? Object.freeze([...new Set(value.map(item => rowRelativeFieldId(String(item))).filter(Boolean))])
    : null;
  const visible = list(fieldPolicy.visible);
  const editable = list(fieldPolicy.editable);
  const normalized = {
    ...(visible ? { visible } : {}),
    ...(editable ? { editable } : {})
  };
  return Object.keys(normalized).length ? Object.freeze(normalized) : null;
}

// The single authored-definition seam (SPEC §20): every consumer of an
// authored graph — server validation/activation, canvas round trip —
// flows through here. Authored definitions speak the current species
// vocabulary only: binding checks run beside id/row resolution, and
// lowering to the executable working shapes happens exactly once,
// internally. Nothing outside this package resolves or lowers the
// vocabulary, and no legacy rewrite runs at any seam.
export function prepareAuthoredDefinition(data = {}, domain = {}) {
  const wasCts = isCtsGraphDefinition(data);
  const { definition, diagnostics } = resolveCtsDefinition(data, domain);
  // Declaration-binding checks are the cts vocabulary's gate.
  const errors = [...(wasCts ? checkCtsGraphBindings(definition, domain) : []), ...diagnostics];
  return { definition, errors };
}

// Block presentation is icon-only: field pick lists derive from the
// projected §13 field schemas (fields(typeId, block)), never from a
// second restated path table here.
const BLOCK_PRESENTATION = {
  identity: { icon: 'pi pi-id-card' },
  status: { icon: 'pi pi-circle-fill' },
  lineage: { icon: 'pi pi-sitemap' },
  relations: { icon: 'pi pi-link' },
  provenance: { icon: 'pi pi-directions-alt' },
  specs: { icon: 'pi pi-list-check' },
  attachments: { icon: 'pi pi-paperclip' },
  data: { icon: 'pi pi-database' },
  summary: { icon: 'pi pi-chart-bar' }
};

const paletteItem = (id, kind, options = {}) => Object.freeze({
  id,
  type: 'processNode',
  kind,
  label: id,
  description: id,
  icon: iconForNode(kind),
  preset: {},
  ...options
});

const definitionPaletteItem = (id, type, options = {}) => Object.freeze({
  id,
  type,
  label: id,
  description: id,
  icon: 'pi pi-circle-fill',
  preset: {},
  ...options
});

// This is an authoring catalog, not the runtime operation catalog. Runtime-only
// coercions and plumbing are deliberately absent: the connection planner owns
// those operations and may insert them when two compatible sockets are joined.
//
// Group structure: `types` (declaration authoring + the registry catalog),
// `operations` (the effect species over declarations), `instances` (entity
// sources, the field projection, and the instance elimination form),
// `values`, `listTree`. Services come
// from the projected domain's `serviceContracts` — the registered operator
// surface — never from a legacy command table: running a service means
// dropping its registered item, so there is no separate "run service"
// operation against the legacy command registry. `cts.decompose` is the
// per-facet elimination form (SPEC §20) and lives in the palette;
// `cts.compose` stays catalog-only — fresh constructs take fields directly
// and fresh mutates patch leaves, so block composition is reachable only
// by migrated legacy graphs. `control.switch` and `control.fork` are
// catalog-only the same way: an equality dispatch composes from
// `control.if` chains, and fan-out is the multi-wire gesture from any
// `completed` output (palette law: README Palette).
export const TYPE_AUTHORING_PALETTE_ITEMS = Object.freeze([
  definitionPaletteItem('class', 'ctsClass'),
  definitionPaletteItem('field', 'ctsField'),
  definitionPaletteItem('state', 'ctsState'),
  definitionPaletteItem('typeReference', 'ctsType')
].map(Object.freeze));

export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    source: 'framework',
    id: 'types',
    items: TYPE_AUTHORING_PALETTE_ITEMS
  },
  {
    source: 'framework',
    id: 'operations',
    items: [
      paletteItem('construct', 'cts.construct'),
      paletteItem('mutate', 'cts.mutate'),
      paletteItem('transition', 'cts.transition'),
      paletteItem('remove', 'cts.remove'),
      paletteItem('emitEvent', 'cts.emit')
    ]
  },
  {
    source: 'framework',
    id: 'control',
    items: [
      paletteItem('choosePath', 'control.if'),
      paletteItem('joinAllPaths', 'control.joinAll'),
      paletteItem('joinAnyPaths', 'control.joinAny'),
      paletteItem('forEachEntity', 'control.forEach'),
      paletteItem('waitUntil', 'control.waitUntil'),
      paletteItem('finish', 'control.stopSuccess'),
      paletteItem('fail', 'control.stopFailure')
    ]
  },
  {
    source: 'framework',
    id: 'instances',
    items: [
      paletteItem('contextEntity', 'cts.read', { preset: { select: 'current' } }),
      paletteItem('allEntities', 'cts.read', { preset: { select: 'all' } }),
      // The pinned-entity-ref source (SPEC §24 definition-design piece):
      // one authored instance reference — the exact record, picked on the
      // node, wireable into any construct's ref sockets.
      paletteItem('pinnedEntity', 'source.literalItem', { preset: { type: { base: 'entityRef' }, access: 'item', value: null } }),
      paletteItem('currentUser', 'source.currentUser'),
      paletteItem('currentOrganization', 'source.currentOrganization'),
      paletteItem('extractProjection', 'cts.read', { preset: { select: 'extract' } }),
      paletteItem('parentEntity', 'cts.read', { preset: { select: 'parent' } }),
      paletteItem('childEntities', 'cts.read', { preset: { select: 'children' } }),
      paletteItem('relatedEntities', 'cts.read', { preset: { select: 'related' } }),
      // the field projection: entity in, one field's value out
      paletteItem('getField', 'cts.field'),
      // the instance elimination form: every declared facet as an output
      paletteItem('decomposeInstance', 'cts.decompose')
    ]
  },
  {
    source: 'framework',
    id: 'values',
    items: [
      paletteItem('literal', 'source.literalItem', { preset: { type: { base: 'string', nullable: false }, access: 'item', value: '' } }),
      paletteItem('literalList', 'source.literalList', { preset: { type: { base: 'string', nullable: false }, value: [] } }),
      paletteItem('currentTime', 'source.currentTime'),
      paletteItem('eventPayload', 'source.triggerPayload', { preset: { path: 'event.payload' } }),
      paletteItem('compareValues', 'value.compare', { preset: { type: { base: 'string', nullable: true }, operation: 'eq' } }),
      paletteItem('selectValue', 'value.select', { preset: { type: { base: 'string', nullable: true } } }),
      paletteItem('logic', 'value.logic', { preset: { type: { base: 'string', nullable: true }, operation: 'and' } }),
      paletteItem('text', 'value.string', { preset: { type: { base: 'string', nullable: false }, operation: 'concat' } }),
      paletteItem('recordField', 'value.recordField', { preset: { path: '', type: { base: 'json', nullable: true } } }),
      paletteItem('constructRecord', 'record.construct', { preset: { fields: [] } }),
      paletteItem('mergeRecords', 'record.merge'),
      paletteItem('calculate', 'value.math', { preset: { type: { base: 'number', nullable: false } } }),
      paletteItem('date', 'value.dateTime', {
        preset: {
          type: { base: 'dateTime', nullable: false },
          operation: 'addDays',
          inputDefaults: { amount: 30 }
        }
      }),
      paletteItem('castValue', 'value.cast', { preset: { outputType: { base: 'record' } } }),
      paletteItem('convertUnit', 'value.convertUnit', { preset: { type: { base: 'number', nullable: false }, fromUnit: 'mm', toUnit: 'm' } }),
      paletteItem('coalesceValue', 'value.coalesce', { preset: { type: { base: 'string', nullable: false } } }),
      paletteItem('formatValue', 'value.format', { preset: { type: { base: 'number', nullable: false }, template: '' } }),
      paletteItem('requireValue', 'value.required', { preset: { type: { base: 'string', nullable: false }, required: true } }),
      paletteItem('validateValue', 'value.validate', { preset: { type: { base: 'string', nullable: false }, required: true } })
    ]
  },
  {
    source: 'framework',
    id: 'listTree',
    items: [
      paletteItem('joinLists', 'collection.concat'),
      paletteItem('joinByKey', 'collection.join'),
      paletteItem('lookupByKey', 'collection.lookup'),
      paletteItem('itemAtPosition', 'collection.itemAt'),
      paletteItem('sliceList', 'collection.slice'),
      paletteItem('listCount', 'collection.count'),
      paletteItem('filterList', 'collection.filter'),
      paletteItem('sortItems', 'collection.sort'),
      paletteItem('dispatchItems', 'collection.dispatch'),
      paletteItem('removeDuplicates', 'collection.distinct'),
      paletteItem('groupItems', 'collection.groupBy'),
      paletteItem('aggregateList', 'collection.reduce', { preset: { type: { base: 'number', nullable: true }, operation: 'sum' } }),
      paletteItem('reverseList', 'collection.reverse'),
      paletteItem('shiftList', 'collection.shift', { preset: { offset: 1 } }),
      paletteItem('partitionList', 'collection.partition', { preset: { size: 2 } }),
      paletteItem('flattenTree', 'tree.flatten', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('graftTree', 'tree.graft', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('simplifyTree', 'tree.simplify', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('branchTree', 'tree.branch', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('zipTrees', 'tree.zip', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('unzipTree', 'tree.unzip', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('crossTrees', 'tree.cross', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('transposeTree', 'tree.transpose', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('cleanTree', 'tree.clean', { preset: { type: { base: 'json', nullable: true } } }),
      paletteItem('treeStats', 'tree.stats', { preset: { type: { base: 'json', nullable: true } } })
    ]
  }
].map(group => Object.freeze({
  ...group,
  items: Object.freeze(group.items)
})));

// The kind's generic palette vocabulary: the item a node of this kind
// reads before authored variants specialize it. Preference: un-narrowed
// presets, then non-entityRef presets (the entityRef-typed literal is
// the pinned-entity variant), then the first item.
export function genericPaletteItemForKind(kind = '') {
  const candidates = PROCESS_DESIGNER_PALETTE_GROUPS
    .flatMap(group => group.items)
    .filter(item => item.kind === kind);
  return candidates.find(item => !item.preset?.operator && !item.preset?.select && !item.preset?.type?.base)
    || candidates.find(item => !item.preset?.operator && !item.preset?.select && item.preset?.type?.base !== 'entityRef')
    || candidates[0] || null;
}

// Declaration-plane wire legality (SPEC §20/§21 one tree): declaration
// canvas nodes wire only to declaration partners. Field/state nodes declare
// on a class node; class/type-reference nodes bind the `type` of a cts.*
// species record. Their typed port specs are authoring contracts for those
// wires only — a declaration node is never a value source, and no data node
// can feed a class declare input — so the generic data-socket compatibility
// path must never apply to them.
export const DECLARATION_NODE_TYPES = Object.freeze(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);

export function declarationWireLegality({ sourceType = '', targetType = '', targetRecord = null, targetRecordKind = '' } = {}) {
  if (sourceType === 'ctsField' && targetType === 'ctsClass') return 'declares';
  // Children edges land child-first: the source is the child (an in-tree
  // class or a type-reference card naming a registry type — SPEC §6, the
  // child edge's type list is not restricted to in-tree declarations),
  // the target the parent class.
  if ((sourceType === 'ctsClass' || sourceType === 'ctsType') && targetType === 'ctsClass') return 'children';  // A state wired into a state input becomes that state's child: the wire's
  // source is the parent, the target (receiving state) the child (SPEC §7).
  if (sourceType === 'ctsState' && targetType === 'ctsState') return 'nested';
  // A state wires into a status-bearing operation's state socket: the
  // construct's initial state, the transition's target — the wire IS the
  // value. The connect gate additionally requires the landed input to be
  // status-typed.
  if (sourceType === 'ctsState' && targetType === 'processNode'
    && ['cts.construct', 'cts.transition'].includes(targetRecord?.kind || targetRecordKind)) {
    return 'entry';
  }
  // A field node wired into a getField's field socket supplies the field
  // (SPEC §20 socket algebra: instance + field = field value). The wire
  // is the field; an authored socket default is equivalent.
  if (sourceType === 'ctsField' && targetType === 'processNode'
    && (targetRecord?.kind || targetRecordKind) === 'cts.field') {
    return 'field';
  }
  // A ref field receives its accepted target types as inputs: wiring a
  // class (or type reference) into the field's targets socket derives the
  // descriptor's `accepts` live from the tree.
  if ((sourceType === 'ctsClass' || sourceType === 'ctsType') && targetType === 'ctsField') return 'targets';
  // Binding wires land on the Type pin — an origin-species socket.
  // Consumers (entity-derived reads, mutate/transition/remove, the field
  // projection) carry no pin: their entity input accepts instance streams
  // only and their binding adapts to the stream's type, so a declaration
  // node never wires into it.
  if ((sourceType === 'ctsClass' || sourceType === 'ctsType')
    && targetType === 'processNode'
    && carriesTypePin(targetRecord || { kind: targetRecordKind })) return 'binds';
  return null;
}

// A children wire is drawn child-first or refused (SPEC §5): the parent
// must be an in-tree class that may declare children (type-reference
// cards and file/party classes never parent). The wire lands exactly as
// drawn; an illegal direction is a gate refusal (owner direction
// 2026-10-18).
export function childrenWireLegality({ target = {} } = {}) {
  return target.type === 'ctsClass' && classMayDeclareChildren(target.class);
}

// Tree declarations compile from the canvas vocabulary (SPEC §20/§21 one
// tree): class nodes with wired field/state nodes become registry
// declarations; a state wired into a state nests under its parent
// (`parent.child`, nested machines); class-to-class wires are children
// edges with onRemove, landing child-first (source = child); transitions
// are declared by transition nodes
// only. Pure over the
// canvas arrays and the bound process-node records — the page supplies
// nodes/edges/records, the server re-validates through the real registry.
// Transition-node-declared target statuses merge into the class axis
// (SPEC §7/§20): target values join without tree nodes, the node fans a
// declared edge from every other value, and its display policy composes
// over the tree's with the transition node winning per value. States
// follow R4: exactly one initial when any state is declared; the compiler
// never picks a default. Tree diagnostics name the authored class name
// (the declaration's future render label), falling back to the registry
// id — raw `t-…` ids never stand alone in a message the designer renders.
function classLabelOf(classNode = null) {
  const name = String(classNode?.data?.name || '').trim();
  return name || String(classNode?.data?.typeId || '').trim();
}

function declarationDiagnostics(nodes = [], edges = [], records = {}) {
  const diagnostics = [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const labelOf = node => String(node.data?.name || node.data?.typeId || node.data?.value || '(state)').trim();
  const stateParent = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type' || edge.label !== 'nested') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source?.type === 'ctsState' && target?.type === 'ctsState') stateParent.set(source.id, target.id);
  }
  // The state vocabulary is flat and draft-local (SPEC §7): each state
  // node contributes its own value to the definition; operations take
  // their state from entry wires.
  const stateValues = new Set();
  for (const node of nodes) {
    if (node.type === 'ctsState' && node.data?.value) stateValues.add(String(node.data.value));
  }
  for (const node of nodes) {
    if (node.type !== 'ctsClass' && node.type !== 'ctsField') continue;
    if (node.type === 'ctsField') {
      const name = String(node.data?.name || '').trim();
      try {
        describeType(node.data?.descriptor || { base: 'string' });
      } catch (error) {
        diagnostics.push(`class ${node.data?.typeId || '(unbound)'}: field ${name || '(unnamed)'}: ${error.message}`);
      }
    }
    if (node.type === 'ctsClass' && Array.isArray(node.data?.operators)) {
      for (const operator of node.data.operators) {
        try {
          normalizeOperator({
            id: String(operator.id || '').trim(),
            species: operator.species,
            input: operator.input || null,
            output: operator.output || null,
            triggers: (operator.triggers || []).filter(trigger => String(trigger.event || trigger.schedule || '').trim()),
            declaringType: node.data.typeId
          });
        } catch (error) {
          diagnostics.push(`class ${labelOf(node)}: operator ${operator.id || '(unnamed)'}: ${error.message}`);
        }
      }
    }
  }

  // Per-state field policy authors on the typed operations (SPEC §7);
  // the declaration-check seam row-checks those lists.
  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (edge.label === 'nested' && source.type === 'ctsState' && target.type === 'ctsState') {
      if (source.id === target.id) diagnostics.push(`state ${labelOf(source)} cannot nest under itself`);
    }
    if (edge.label === 'children' && source.type === 'ctsClass' && target.type === 'ctsClass'
      && !classMayDeclareChildren(target.data?.class)) {
      diagnostics.push(`class ${labelOf(target)} (${target.data.class}): ${target.data.class} classes may not declare lineage children — containment belongs to item, group, or process classes`);
    }
  }

  // Authored state targets must name a declared state of the bound type —
  // the vocabulary is the draft's own state nodes; an unscoped value token
  // satisfies any type.
  for (const record of Object.values(records || {})) {
    if (!['cts.construct', 'cts.transition'].includes(record?.kind)) continue;
    const target = record.kind === 'cts.transition'
      ? record.state?.to ?? record.inputDefaults?.state
      : record.inputDefaults?.state;
    if (typeof target !== 'string' || !target) {
      // An executable transition authors its target and nothing else — the
      // entity arrives with its from-state. A transition without a target
      // is unfinished authoring the designer names at the node, before any
      // activation attempt. Archive transitions resolve their intent at
      // the effect boundary and declare no target.
      if (record.kind === 'cts.transition' && record.archive !== true) {
        diagnostics.push(`transition ${record.id || '(unnamed)'}: pick a target state`);
      }
      continue;
    }
    if (!record.typeId) continue;
    if (!stateValues.has(target)) {
      diagnostics.push(`${record.kind === 'cts.transition' ? 'transition' : 'construct'} ${record.id || '(unnamed)'}: state ${target} not declared in this draft`);
    }
  }

  // Nesting chains must be acyclic.
  const stateNodes = nodes.filter(node => node.type === 'ctsState' && node.data?.value);
  const seenAncestors = new Set();
  for (const state of stateNodes) {
    seenAncestors.clear();
    let cursor = state;
    while (cursor && stateParent.has(cursor.id)) {
      if (seenAncestors.has(cursor.id)) {
        diagnostics.push(`state ${labelOf(cursor)} has a cyclic nesting chain`);
        break;
      }
      seenAncestors.add(cursor.id);
      cursor = nodeById.get(stateParent.get(cursor.id));
    }
  }
  return diagnostics;
}

export function compileTreeDeclarations(nodes = [], edges = [], records = {}) {
  const ctsRecords = {};
  const graphNodes = [];

  for (const node of nodes) {
    if (!['ctsClass', 'ctsField', 'ctsState'].includes(node.type)) {
      graphNodes.push(node);
      continue;
    }
    const recordId = String(node.data?.refId || node.id);
    const data = { ...(node.data || {}), refId: recordId };
    graphNodes.push({ ...node, data });
    if (node.type === 'ctsClass') {
      ctsRecords[recordId] = {
        id: recordId,
        kind: 'class',
        typeId: data.typeId,
        class: data.class,
        ...(data.name ? { name: data.name } : {}),
        ...(data.glyph ? { glyph: data.glyph } : {}),
        ...(data.payload ? { payload: data.payload } : {}),
        ...(Array.isArray(data.migrate) && data.migrate.length ? { migrate: data.migrate } : {}),
        ...(Array.isArray(data.operators) ? { operators: data.operators } : {})
      };
      continue;
    }
    if (node.type === 'ctsField') {
      ctsRecords[recordId] = {
        id: recordId,
        kind: 'field',
        typeId: data.typeId,
        name: data.name,
        descriptor: data.descriptor || { base: 'string' }
      };
      continue;
    }
    ctsRecords[recordId] = {
      id: recordId,
      kind: 'state',
      value: data.value,
      ...(data.label ? { label: data.label } : {}),
      ...(data.severity ? { severity: data.severity } : {}),
      ...(data.icon ? { icon: data.icon } : {})
    };
  }

  const declarations = declarationsFromCtsRecords(
    ctsRecords,
    records,
    { nodes: graphNodes, edges }
  );
  const diagnostics = declarationDiagnostics(nodes, edges, records);
  for (const declaration of declarations) {
    try {
      normalizeType({ ...declaration, scope: 'org', organizationId: 'designer-overlay' });
    } catch (error) {
      diagnostics.push(`class ${declaration.name || declaration.id}: ${error.message}`);
    }
  }
  return { declarations: declarationsInDependencyOrder(declarations), diagnostics };
}

// Declarations post in dependency order: a declaration referencing another
// in-tree type (children edge source, ref-field accepts) comes AFTER its
// references, so one apply can introduce a parent and its child together —
// the registry compiles cross-references only against stored and already
// posted types. Cycles fall back to node order; the registry's own compile
// owns the cycle diagnostic.
function declarationsInDependencyOrder(declarations = []) {
  const byId = new Map(declarations.map(declaration => [declaration.id, declaration]));
  const ordered = [];
  const placed = new Set();
  const visiting = new Set();
  const visit = (declaration) => {
    if (placed.has(declaration.id) || visiting.has(declaration.id)) return;
    visiting.add(declaration.id);
    for (const reference of referencedTypeIds(declaration)) {
      if (byId.has(reference)) visit(byId.get(reference));
    }
    visiting.delete(declaration.id);
    placed.add(declaration.id);
    ordered.push(declaration);
  };
  for (const declaration of declarations) visit(declaration);
  return ordered;
}

function referencedTypeIds(declaration = {}) {
  const ids = [];
  for (const edge of Object.values(declaration.edges?.children || {})) {
    ids.push(...(edge.types || []));
  }
  for (const descriptor of Object.values(declaration.fields || {})) {
    if (isRefDescriptor(descriptor)) ids.push(...refAcceptsOf(descriptor));
  }
  return ids;
}

// Single-holder display-role authoring (SPEC §4): enabling `identifier`
// or `depiction` on one field node clears the flag from the previous
// holder among the sibling field nodes of the same declared type — the
// compile law is exactly-one authored (identifier) / at-most-one
// (depiction) — an unflagged type carries the compile error until a
// field is picked. Mutates the canvas nodes' authoring state in place,
// like the enrichment pass; the caller owns the sync. An unbound field
// (no declared type) owns its own flag only — it declares nowhere yet.
export function applyFieldDisplayRole(nodes = [], fieldNodeId = '', flag = '', enabled = true) {
  if (flag !== 'identifier' && flag !== 'depiction') return;
  const target = nodes.find(node => node.id === fieldNodeId && node.type === 'ctsField');
  if (!target) return;
  const typeId = target.data?.typeId ?? null;
  for (const node of nodes) {
    if (node.type !== 'ctsField') continue;
    const isTarget = node.id === fieldNodeId;
    if (!isTarget && (typeId == null || (node.data?.typeId ?? null) !== typeId)) continue;
    const holds = node.data?.descriptor?.[flag] === true;
    if (isTarget && enabled === true) {
      if (!holds) node.data.descriptor = { ...(node.data.descriptor || { base: 'string' }), [flag]: true };
    } else if (holds) {
      const next = { ...(node.data.descriptor || {}) };
      delete next[flag];
      node.data.descriptor = next;
    }
  }
}

// Typed port specs for declaration canvas nodes: every handle a
// declaration node renders has a spec, exactly like operation nodes —
// fields output their declared type, states expose a status input (the
// transition-from handle) and a status output, classes accept declarations
// and offer a typed entityRef of the declared id, and a type reference
// offers the same typed output as a bound class. `types` is the
// designer's registry view (ctstype entries by id) for reference nodes.
export function declarationNodePorts(node = {}, types = []) {
  if (node.type === 'ctsClass') {
    return {
      inputSpecs: [{ id: 'declare', label: 'fields', role: 'data', type: processType('json'), access: 'item', plane: 'declaration' }],
      outputSpecs: node.data?.typeId
        ? [{ id: 'type', label: node.data.typeId, role: 'data', type: processType('entityRef', { typeId: node.data.typeId }), access: 'item', plane: 'declaration' }]
        : []
    };
  }
  if (node.type === 'ctsField') {
    const isRef = isRefDescriptor(node.data?.descriptor || {});
    return {
      inputSpecs: isRef
        ? [{ id: 'targets', label: 'targets', role: 'data', type: processType('entityRef'), access: 'item', multiple: true }]
        : [],
      outputSpecs: [{
        id: 'field',
        label: node.data?.name || 'field',
        role: 'data',
        type: ctsFieldToProcessType(node.data?.descriptor || {}) || processType('json'),
        access: 'item'
      }]
    };
  }
  if (node.type === 'ctsState') {
    return {
      // The input nests another state node inside this one (SPEC §7); the
      // output is the value wired into create/transition state sockets.
      inputSpecs: [{ id: 'state', role: 'data', type: processType('status'), access: 'item', plane: 'declaration' }],
      outputSpecs: [{ id: 'state', label: node.data?.value || 'state', role: 'data', type: processType('status'), access: 'item' }]
    };
  }
  if (node.type === 'ctsType') {
    const entry = types.find(candidate => candidate.id === node.data?.typeId);
    return {
      inputSpecs: [],
      outputSpecs: entry
        ? [{ id: 'type', label: entry.id, role: 'data', type: processType('entityRef', { typeId: entry.id }), access: 'item', plane: 'declaration' }]
        : []
    };
  }
  return null;
}

// Live interpretation of declaration wires (SPEC §20/§21 one tree): the
// wire IS the binding channel, evaluated on every graph change — not a
// write-once gesture. A field/state node's type id follows the class it
// declares on. A species record's binding resolves by precedence:
// 1. an explicit binds wire (class/type reference -> record): the source's
//    type id, live — renaming the source re-binds every wired descendant;
// 2. for consumer species (no Type pin), the entity input's source type —
//    `resolvers.entityInputType(recordId)` supplies it from the designer's
//    port resolution, so plugging an entity stream into an unbound
//    mutate/transition/remove adapts it to that type;
// 3. the stored binding (palette preset, migration, headless authoring) —
//    authored data, never cleared by interpretation; validation's anchored
//    unknown-type report owns a binding whose type no longer exists.
// Removing the channel that supplied a binding clears it. Pure over the
// canvas arrays: returns only the mutations that differ from current
// state, so an unchanged graph evaluates to no writes.
export function interpretDeclarationEdges(nodes = [], edges = [], records = {}, previousBindings = {}, resolvers = {}, knownTypeIds = []) {
  const mutations = [];
  const bindings = {};
  const fieldCounts = new Map();
  const declaredBy = new Map();
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const bindEdges = [];
  const refTargetsByField = new Map();
  const stateEntryEdges = [];
  const fieldEntryEdges = [];

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (source.type === 'ctsField' && target.type === 'ctsClass') {
      declaredBy.set(source.id, target.id);
      fieldCounts.set(target.id, (fieldCounts.get(target.id) || 0) + 1);
    } else if (source.type === 'ctsClass' || source.type === 'ctsType') {
      if (target.type === 'processNode') {
        bindEdges.push([source, target]);
      } else if (target.type === 'ctsField') {
        const targets = refTargetsByField.get(target.id) || [];
        const typeId = source.data?.typeId;
        if (typeId && !targets.includes(typeId)) targets.push(typeId);
        refTargetsByField.set(target.id, targets);
      }
    } else if (source.type === 'ctsState' && target.type === 'processNode') {
      stateEntryEdges.push([source, target]);
    } else if (source.type === 'ctsField' && target.type === 'processNode') {
      fieldEntryEdges.push([source, target]);
    }
  }

  // The wire is the field (SPEC §20): a field node wired into a getField's
  // field socket authors that node's field path — the slot-qualified row
  // path the projection derives (slot from the declaring class, id from
  // the authored name). `path` is the single persisted home.
  for (const [fieldNode, targetNode] of fieldEntryEdges) {
    const record = records[targetNode.data?.refId];
    if (record?.kind !== 'cts.field') continue;
    const fieldId = rowFieldId(String(fieldNode.data?.name || '').trim());
    if (!fieldId) continue;
    const path = `${isRefDescriptor(fieldNode.data?.descriptor || {}) ? 'relations' : 'fields'}.${fieldId}`;
    if (record.path !== path) {
      mutations.push({ scope: 'record', recordId: targetNode.data.refId, key: 'path', value: path });
    }
  }

  // The wire is the value (SPEC §7): a state wired into a construct or
  // transition authors that operation's state socket default — the
  // construct's initial state, the transition's target.
  for (const [stateNode, targetNode] of stateEntryEdges) {
    const record = records[targetNode.data?.refId];
    if (!['cts.construct', 'cts.transition'].includes(record?.kind)) continue;
    const value = String(stateNode.data?.value || '');
    if (!value) continue;
    if (record.inputDefaults?.state !== value) {
      mutations.push({ scope: 'record', recordId: targetNode.data.refId, key: 'inputDefaults.state', value });
    }
  }

  for (const node of nodes) {
    if (node.type === 'ctsField') {
      const classNode = declaredBy.has(node.id) ? nodeById.get(declaredBy.get(node.id)) : null;
      const value = classNode?.data?.typeId || null;
      if ((node.data?.typeId ?? null) !== value) {
        mutations.push({ scope: 'node', nodeId: node.id, key: 'typeId', value });
      }
    }
    if (node.type === 'ctsField') {
      // A ref field's accepted targets derive from its target wires while
      // any exist (the tree is the source); the multiselect fallback only
      // covers types with no canvas node.
      const wired = refTargetsByField.get(node.id);
      if (wired && isRefDescriptor(node.data?.descriptor || {})) {
        const accepts = wired.filter(typeId => Boolean(typeId));
        const descriptor = node.data.descriptor;
        const current = refAcceptsOf(descriptor);
        if (JSON.stringify(current) !== JSON.stringify(accepts)) {
          mutations.push({
            scope: 'node',
            nodeId: node.id,
            key: 'descriptor',
            value: descriptor.base === 'ref'
              ? { ...descriptor, accepts }
              : { ...descriptor, itemType: { ...descriptor.itemType, accepts } }
          });
        }
      }
    }
    if (node.type === 'ctsClass') {
      const fields = fieldCounts.get(node.id) || 0;
      if (node.data?.fields !== fields) mutations.push({ scope: 'node', nodeId: node.id, key: 'fields', value: fields });
    }
  }

  const entityBound = new Set();
  for (const [source, target] of bindEdges) {
    const record = records[target.data?.refId];
    if (record && TYPE_BOUND_SPECIES.includes(String(record.kind || ''))) {
      bindings[record.id] = source.data?.typeId || '';
      entityBound.add(record.id);
    }
  }
  if (typeof resolvers.entityInputType === 'function') {
    for (const record of Object.values(records)) {
      if (entityBound.has(record.id)) continue;
      if (!TYPE_BOUND_SPECIES.includes(String(record.kind || '')) || carriesTypePin(record)) continue;
      const fromWire = resolvers.entityInputType(record.id);
      if (fromWire) bindings[record.id] = fromWire;
    }
  }
  // A channel removed since the last evaluation unbinds the record it
  // carried (unless another channel or an authored preset supplies one).
  for (const [recordId] of Object.entries(previousBindings)) {
    if (bindings[recordId] === undefined && records[recordId]) bindings[recordId] = '';
  }
  for (const [recordId, typeId] of Object.entries(bindings)) {
    const record = records[recordId];
    if (!record) continue;
    if (typeIdOf(record) !== typeId) {
      mutations.push({ scope: 'record', recordId, key: 'typeId', value: typeId });
    }
  }

  // A STORED binding that names a type outside the caller's vocabulary
  // survives untouched: the served type view can be staler than the
  // definition (a page session opened before the org declared the type),
  // and validation's anchored unknown-type report owns dead bindings —
  // the same principle the lowering and the producer-identity migration
  // follow. Only a wire can clear a wire-sourced binding.
  return { mutations, bindings };
}

const ENTITY_ORIGIN_OPERATION_KINDS = new Set(PRODUCER_ORIGIN_SPECIES_KINDS);

// A producer output is provenance for an actual entity origin. Reads,
// projections, joins, and consumer effects may carry entity-shaped values,
// but none of them creates a new lifecycle/producer identity.
export function isEntityOriginRecord(record = {}) {
  const operation = operationKindOf(record);
  if (!ENTITY_ORIGIN_OPERATION_KINDS.has(operation)) return false;
  return (record.outputs || []).some(output => (
    output?.id && ['entity', 'entityRef'].includes(output.type?.base) && output.type?.typeId
  ));
}

export function syncProcessNodeProducerOutputs(data = {}, node = {}) {
  if (!node.id) return [];
  const producerOutputs = data.producerOutputs ||= {};
  const pruneOwnOutputs = () => {
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (output?.nodeId === node.id) delete producerOutputs[producerOutputId];
    }
  };

  // The old join record and every non-origin species are deliberately
  // provenance-free. This also removes a stale output when a read is
  // re-bound or a migrated record changes species.
  if (!isEntityOriginRecord(node)) {
    pruneOwnOutputs();
    delete node.producerOutputId;
    delete node.selectedProducerOutputId;
    return [];
  }

  const outputs = (node.outputs || []).filter(output => (
    output?.id && ['entity', 'entityRef'].includes(output.type?.base) && output.type?.typeId
  ));
  const outputIds = new Set(outputs.map(output => `${node.id}:${output.id}`));

  for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
    if (output?.nodeId === node.id && !outputIds.has(producerOutputId)) delete producerOutputs[producerOutputId];
  }

  for (const output of outputs) {
    const producerOutputId = `${node.id}:${output.id}`;
    producerOutputs[producerOutputId] = {
      ...producerOutputs[producerOutputId],
      producerOutputId,
      nodeId: node.id,
      outputSocketId: output.id,
      typeId: output.type.typeId,
      lifecycle: producerOutputs[producerOutputId]?.lifecycle || { mode: 'defaultCreated' },
      fields: producerOutputs[producerOutputId]?.fields || { read: [], write: [], private: [] }
    };
  }

  delete node.selectedProducerOutputId;
  if (outputIds.size === 1) [node.producerOutputId] = outputIds;
  else delete node.producerOutputId;
  return [...outputIds];
}

// Framework services (SPEC §8 s species): providerless service
// contracts keep one platform Services group. Plugin-owned services
// belong to `pluginPaletteGroups`.
export function servicesPaletteGroups(serviceContracts = {}) {
  const frameworkItems = [];
  for (const service of Object.values(serviceContracts || {})) {
    if (!service?.id || !service.command || service.palette?.visible === false) continue;
    if (String(service.plugin || '') || pluginProviderId(service)) continue;
    frameworkItems.push(paletteItem(
      `service:${service.id}`,
      'cts.service',
      {
        label: service.label || service.render?.label || service.id,
        description: service.description || service.render?.description || service.label || service.render?.label || service.id,
        searchTerms: [service.id, service.command, ...Object.keys(service.signature?.input?.fields || {}), ...Object.keys(service.signature?.output?.fields || {}), ...(service.palette?.keywords || [])].filter(Boolean),
        icon: service.render?.icon || 'pi pi-bolt',
        preset: { operator: service.id }
      }
    ));
  }
  return frameworkItems.length
    ? [{ id: 'services', label: 'Services', items: frameworkItems, source: 'framework' }]
    : [];
}

// Plugin palette sections (SPEC §28.14): one section per installed
// plugin, named by the plugin, the plugin's declared groups as subgroups
// inside; ungrouped contributions sit on the section root. Services
// arrive in the projected shape (`group`, `groupLabel`, `plugin`,
// `pluginLabel`) or the listing shape (`palette.group`); projection
// contracts carry `palette`.
export function pluginPaletteGroups(projectionContracts = {}, serviceContracts = {}) {
  const sections = new Map();
  const sectionFor = (provider, pluginLabel = '') => {
    const id = `plugin-${provider}`;
    if (!sections.has(id)) {
      sections.set(id, { id, label: pluginLabel || humanizePaletteGroup(provider), source: 'plugin', root: [], subgroups: new Map() });
    } else if (pluginLabel) sections.get(id).label = pluginLabel;
    return sections.get(id);
  };
  const itemsFor = (section, group, label = '') => {
    if (!group) return section.root;
    if (!section.subgroups.has(group)) {
      section.subgroups.set(group, { id: group, label: label || humanizePaletteGroup(group), items: [] });
    } else if (label) section.subgroups.get(group).label = label;
    return section.subgroups.get(group).items;
  };
  const seenProjections = new Set();
  for (const projection of Object.values(projectionContracts || {})) {
    if (!projection?.id || !projection.palette?.group || projection.palette.visible === false) continue;
    const provider = pluginProviderId(projection);
    if (!provider) continue;
    const key = `${provider}:${projection.id}`;
    if (seenProjections.has(key)) continue;
    seenProjections.add(key);
    itemsFor(sectionFor(provider), projection.palette.group, projection.palette.label).push(paletteItem(`extract:${provider}:${projection.id}`, 'cts.read', {
      label: projection.label,
      description: projection.description || projection.label,
      searchTerms: [provider, projection.id, projection.typeId, projection.service, ...(projection.palette.keywords || [])].filter(Boolean),
      icon: 'pi pi-table',
      preset: { select: 'extract', projection: projection.id }
    }));
  }
  for (const service of Object.values(serviceContracts || {})) {
    if (!service?.id || !service.command || service.palette?.visible === false) continue;
    const provider = String(service.plugin || '') || pluginProviderId(service);
    if (!provider) continue;
    const group = String(service.palette?.group || service.group || '');
    const groupLabel = String(service.palette?.label || service.groupLabel || '');
    const localId = String(service.id).startsWith(`plugin.${provider}.`)
      ? String(service.id).slice(`plugin.${provider}.`.length)
      : String(service.id);
    itemsFor(sectionFor(provider, String(service.pluginLabel || '')), group === provider ? '' : group, groupLabel).push(paletteItem(`service:${provider}:${localId}`, 'cts.service', {
      label: service.label || service.render?.label || localId,
      description: service.description || service.render?.description || service.render?.label || localId,
      searchTerms: [provider, service.id, service.command, ...Object.keys(service.signature?.input?.fields || {}), ...Object.keys(service.signature?.output?.fields || {}), ...(service.palette?.keywords || [])].filter(Boolean),
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  }
  return [...sections.values()]
    .map(({ id, label, source, root, subgroups }) => {
      const groups = [...subgroups.values()];
      return {
        id,
        label,
        source,
        items: [...root, ...groups.flatMap(group => group.items)],
        ...(groups.length ? { subgroups: groups } : {})
      };
    })
    .filter(section => section.items.length);
}

function pluginProviderId(source = {}) {
  const direct = String(source.pluginId || source.provider || '');
  if (direct) {
    const parts = direct.split('.');
    return parts[0] === 'plugin' ? (parts[1] || '') : (parts[0] || '');
  }
  const reference = String(source.resolve?.service || source.command || source.id || '');
  const parts = reference.split('.');
  return parts[0] === 'plugin' ? (parts[1] || '') : '';
}

function humanizePaletteGroup(value = '') {
  return String(value).split(/[-_.]+/).filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

// Type catalog palette (SPEC §20/§21, L2): registry types are draggable
// composables — one bound construct per constructible type, plus one
// variant per declared construct operator (the org-authored `via`). One
// group beside the declaration items, labeled by the item's class in the
// description.
export function createProcessDesignerContract(domain = {}, capabilities = null, options = {}) {
  const entities = Array.isArray(domain.entities) ? domain.entities : [];
  const entityByType = new Map(entities.map(entity => [entity.type, entity]));

  function capabilityFor(typeId = '') {
    return capabilities ? (lookupEntityContract(capabilities, typeId) || null) : null;
  }

  function createModes(typeId = '') {
    if (capabilities) {
      const capability = capabilityFor(typeId);
      return Array.isArray(capability?.createModes) ? [...capability.createModes] : [];
    }
    const contract = lookupEntityContract(domain.construction, typeId);
    return contract && Array.isArray(contract.modes) ? [...contract.modes] : [];
  }

  function fieldPolicy(typeId = '') {
    return lookupEntityContract(domain.fieldAccess, typeId) || {};
  }

  function construction(typeId = '') {
    return lookupEntityContract(domain.construction, typeId) || null;
  }

  function blocks(typeId = '') {
    const declared = entityByType.get(typeId)?.blocks || [];
    const policyRoots = allFieldPaths(fieldPolicy(typeId))
      .map(path => String(path).split('.')[0]);
    const available = new Set([...declared, ...policyRoots]);
    return CANONICAL_ENTITY_BLOCKS
      .filter(id => available.has(id))
      .map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] }));
  }

  function fields(typeId = '', block = '') {
    const schemas = lookupEntityContract(domain.fieldSchemas, typeId) || [];
    return schemas
      .filter(schema => !block || schema.block === block)
      .map(schema => ({
        ...schema,
        label: schema.label || schema.path,
        value: schema.path
      }));
  }

  function blockFields(block = '') {
    const schemas = block
      ? (domain.blockSchemas?.[block] || [])
      : Object.values(domain.blockSchemas || {}).flat();
    return schemas.map(schema => ({
      ...schema,
      label: schema.label || schema.path,
      value: schema.path
    }));
  }

  const paletteGroups = [
    ...pluginPaletteGroups(domain.projectionContracts || {}, domain.serviceContracts || {}),
    ...servicesPaletteGroups(domain.serviceContracts || {}),
    ...PROCESS_DESIGNER_PALETTE_GROUPS.map(group => ({
      ...group,
      items: group.items
    }))
  ];

  const entityOption = entity => ({ label: entity.label || entity.type, value: entity.type });

  const listableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.list) : true)
    .map(entityOption);

  const readableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.getById) : true)
    .map(entityOption);

  // Capability-gated with a declaration fallback: view types (pack, org)
  // synthesize construction and are served by the generic instance
  // services, so a missing capability entry means constructible, not dead —
  // legacy services keep their explicit capability truth.
  const constructible = typeId => {
    if (!capabilities) return createModes(typeId).length > 0;
    const capability = capabilityFor(typeId);
    if (capability) return (capability.createModes?.length || 0) > 0;
    return createModes(typeId).length > 0;
  };
  const createEntityOptions = entities
    .filter(entity => constructible(entity.type))
    .map(entityOption);

  const updateEntityOptions = entities
    .filter(entity => capabilities
      ? Boolean(capabilityFor(entity.type)?.processUpdate)
      : (lookupEntityContract(domain.fieldSchemas, entity.type) || []).some(schema => schema.writable === true))
    .map(entityOption);

  const changeStatusOptions = entities
    .filter(entity => capabilities
      ? Boolean(capabilityFor(entity.type)?.statusMutation)
      : Boolean((domain.workflows || {})[entity.type]))
    .map(entityOption);

  const deleteEntityOptions = entities
    .filter(entity => capabilities && Boolean(capabilityFor(entity.type)?.delete))
    .map(entityOption);

  const archivableEntityOptions = entities
    .filter(entity => capabilities && Boolean(capabilityFor(entity.type)?.archive))
    .map(entityOption);

  const enabledPaletteGroups = paletteGroups.map(group => ({
    ...group,
    items: group.items.filter(item => (
      item.kind !== 'cts.remove' || deleteEntityOptions.length > 0
    ))
  }));

  return {
    domain,
    paletteGroups: enabledPaletteGroups,
    editors: (options.editors || []).map(editor => ({ ...editor })),
    blocks: CANONICAL_ENTITY_BLOCKS.map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] })),
    entityOptions: entities.map(entityOption),
    listableEntityOptions,
    readableEntityOptions,
    createEntityOptions,
    createModes,
    updateEntityOptions,
    changeStatusOptions,
    deleteEntityOptions,
    archivableEntityOptions,
    workflowOptions: Object.entries(domain.workflows || {}).map(([typeId, workflow]) => ({ label: workflow.label || typeId, value: typeId })),
    commandOptions: definitionOptions(domain.commands),
    taskOptions: definitionOptions(domain.tasks),
    eventOptions: definitionOptions(domain.events),
    hookOptions: definitionOptions(domain.hooks),
    effectOptions: definitionOptions(domain.effects),
    attachmentKindOptions: Object.values(domain.attachmentKinds || {}).map(definition => ({
      label: `${definition.label || definition.name || definition.kind} · ${definition.creation?.mode || 'workflow'}`,
      value: definition.kind,
      creation: definition.creation || { mode: 'workflow' },
      editor: definition.editor || { mode: 'none' }
    })),
    entity: typeId => entityByType.get(typeId) || null,
    fieldPolicy,
    construction,
    blocksForEntity: blocks,
    fieldsForEntity: fields,
    fieldsForBlock: blockFields,
    blockComposition: block => domain.blockComposition?.[block] || null,
    blockFieldType: path => blockFields(String(path || '').split('.')[0])
      .find(field => field.value === path)?.type || {
        base: 'json',
        nullable: true
      },
    fieldType: (typeId, path) => fields(typeId).find(field => field.value === path)?.type || {
      base: 'json',
      nullable: true
    }
  };
}

function lookupEntityContract(contracts = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return contracts?.[key] || contracts?.[camel] || contracts?.[snake] || null;
}

function allFieldPaths(policy = {}) {
  return ['read', 'write', 'admin'].flatMap(level => Array.isArray(policy[level]) ? policy[level] : []);
}

function definitionOptions(definitions = {}, idKey = 'id') {
  const items = Array.isArray(definitions) ? definitions : Object.values(definitions || {});
  return items
    .map(definition => ({
      label: definition.label || definition.name || definition[idKey] || definition.id,
      value: definition[idKey] || definition.id
    }))
    .filter(option => option.value);
}

function iconForNode(kind = '') {
  if (kind.startsWith('cts.construct')) return 'pi pi-plus-circle';
  if (kind.startsWith('cts.mutate')) return 'pi pi-pencil';
  if (kind.startsWith('cts.transition')) return 'pi pi-forward';
  if (kind.startsWith('cts.remove')) return 'pi pi-trash';
  if (kind.startsWith('cts.command')) return 'pi pi-bolt';
  if (kind.startsWith('cts.conversion')) return 'pi pi-replay';
  if (kind.startsWith('cts.read')) return 'pi pi-database';
  if (kind.startsWith('cts.field')) return 'pi pi-angle-right';
  if (kind.startsWith('cts.compose')) return 'pi pi-box';
  if (kind.startsWith('cts.decompose')) return 'pi pi-objects-column';
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return kind.includes('logic') || kind.includes('compare') ? 'pi pi-sitemap' : 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  return 'pi pi-directions';
}
