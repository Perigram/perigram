import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { PRODUCER_ORIGIN_EFFECT_KINDS, TYPE_BOUND_SPECIES, carriesTypePin } from './node-catalog.js';
import { operationKindOf, describeType, normalizeOperator, normalizeType, typeIdOf, ctsFieldToProcessType, declarationsFromCtsRecords, slotFor } from '../../cts/src/index.js';
// Single vocabulary seam: the species/operation table is re-exported, never
// imported from the type system package directly by app surfaces.
export { operationKindOf };
import { resolveCtsDefinition, checkCtsGraphBindings, isCtsGraphDefinition, classMayDeclareChildren } from '../../cts/src/index.js';
import { processType } from './types.js';

// Field-id derivation for authored names: the label is user-plane, the
// row key is plumbing. Splits on any non-alphanumeric run, lowercases the
// first segment, capitalizes the rest ("Field name 2" -> "fieldName2").
// Returns '' when nothing alphanumeric survives (unfinished input).
// Exported as the one derivation home: designer surfaces mapping a field
// id back to its authored label (the type-migration step dialog) derive
// ids exactly the way the compiled declaration does.
export function camelCaseId(value = '') {
  const segments = String(value).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (!segments.length) return '';
  const [first, ...rest] = segments;
  return first.charAt(0).toLowerCase() + first.slice(1)
    + rest.map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
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

const BLOCK_PRESENTATION = {
  identity: { defaultPath: 'identity.name', icon: 'pi pi-id-card', fields: ['identity.uid', 'identity.name', 'identity.slug', 'identity.serial', 'identity.reference'] },
  origin: { defaultPath: 'origin.state.primary', icon: 'pi pi-history', fields: ['origin.state.primary', 'origin.userId', 'origin.timestamp', 'origin.metadata', 'origin.eventId', 'origin.lifecycle'] },
  status: { defaultPath: 'states.main', icon: 'pi pi-circle-fill', fields: ['states.main', 'status.userId', 'status.timestamp', 'status.metadata', 'status.eventId', 'status.lifecycle'] },
  lineage: { defaultPath: 'lineage.organizationId', icon: 'pi pi-sitemap' },
  relations: { defaultPath: 'relations.value', icon: 'pi pi-link' },
  provenance: { defaultPath: 'provenance.source', icon: 'pi pi-directions-alt' },
  specs: { defaultPath: 'specs.width', icon: 'pi pi-list-check', fields: ['specs.width', 'specs.length', 'specs.area', 'specs.sheetThickness', 'specs.foilThickness'] },
  attachments: { defaultPath: 'attachments.primary', icon: 'pi pi-paperclip' },
  data: { defaultPath: 'data.value', icon: 'pi pi-database' },
  summary: { defaultPath: 'summary.value', icon: 'pi pi-chart-bar' }
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
// sources and the field projection), `values`, `listTree`. Services come
// from the projected domain's `serviceContracts` — the registered operator
// surface — never from a legacy command table: running a service means
// dropping its registered item, so there is no separate "run service"
// operation against the legacy command registry. The block-composition
// nodes (cts.compose, cts.decompose) stay catalog-only: fresh constructs
// take fields directly, fresh mutates patch leaves, and the field
// projection reads entities — no palette item consumes blocks anymore, so
// block composition is reachable only by migrated legacy graphs.
export const TYPE_AUTHORING_PALETTE_ITEMS = Object.freeze([
  definitionPaletteItem('class', 'ctsClass'),
  definitionPaletteItem('field', 'ctsField'),
  definitionPaletteItem('state', 'ctsState'),
  definitionPaletteItem('typeReference', 'ctsType')
].map(Object.freeze));

export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    id: 'types',
    items: TYPE_AUTHORING_PALETTE_ITEMS
  },
  {
    id: 'operations',
    items: [
      paletteItem('construct', 'cts.construct'),
      paletteItem('mutate', 'cts.mutate'),
      paletteItem('transition', 'cts.transition'),
      paletteItem('remove', 'cts.remove')
    ]
  },
  {
    id: 'control',
    items: [
      paletteItem('choosePath', 'control.if'),
      paletteItem('switchPaths', 'control.switch'),
      paletteItem('parallelPaths', 'control.fork'),
      paletteItem('joinAllPaths', 'control.joinAll'),
      paletteItem('joinAnyPaths', 'control.joinAny'),
      paletteItem('forEachEntity', 'control.forEach'),
      paletteItem('finish', 'control.stopSuccess'),
      paletteItem('fail', 'control.stopFailure')
    ]
  },
  {
    id: 'instances',
    items: [
      paletteItem('contextEntity', 'cts.read', { preset: { select: 'current' } }),
      paletteItem('allEntities', 'cts.read', { preset: { select: 'all' } }),
      paletteItem('extractProjection', 'cts.read', { preset: { select: 'extract' } }),
      paletteItem('parentEntity', 'cts.read', { preset: { select: 'parent' } }),
      paletteItem('childEntities', 'cts.read', { preset: { select: 'children' } }),
      paletteItem('relatedEntities', 'cts.read', { preset: { select: 'related' } }),
      // the field projection: entity in, one field's value out
      paletteItem('getField', 'cts.field')
    ]
  },
  {
    id: 'values',
    items: [
      paletteItem('literal', 'source.literalItem', { preset: { type: { base: 'string', nullable: false }, access: 'item', value: '' } }),
      paletteItem('literalList', 'source.literalList', { preset: { type: { base: 'string', nullable: false }, value: [] } }),
      paletteItem('compareValues', 'value.compare', { preset: { type: { base: 'string', nullable: true }, operation: 'eq' } }),
      paletteItem('logic', 'value.logic', { preset: { type: { base: 'string', nullable: true }, operation: 'and' } }),
      paletteItem('text', 'value.string', { preset: { type: { base: 'string', nullable: false }, operation: 'concat' } }),
      paletteItem('recordField', 'value.recordField', { preset: { path: '', type: { base: 'json', nullable: true } } }),
      paletteItem('constructRecord', 'record.construct', { preset: { fields: [] } }),
      paletteItem('calculate', 'value.math', { preset: { type: { base: 'number', nullable: false } } }),
      paletteItem('date', 'value.dateTime', {
        preset: {
          type: { base: 'dateTime', nullable: false },
          operation: 'addDays',
          inputDefaults: { amount: 30 }
        }
      })
    ]
  },
  {
    id: 'listTree',
    items: [
      paletteItem('joinLists', 'collection.concat'),
      paletteItem('joinByKey', 'collection.join'),
      paletteItem('itemAtPosition', 'collection.itemAt'),
      paletteItem('sliceList', 'collection.slice'),
      paletteItem('listCount', 'collection.count'),
      paletteItem('filterList', 'collection.filter'),
      paletteItem('sortItems', 'collection.sort'),
      paletteItem('dispatchItems', 'collection.dispatch'),
      paletteItem('removeDuplicates', 'collection.distinct'),
      paletteItem('groupItems', 'collection.groupBy')
    ]
  }
].map(group => Object.freeze({
  ...group,
  items: Object.freeze(group.items)
})));

// Declaration-plane wire legality (SPEC §20/§21 one tree): declaration
// canvas nodes wire only to declaration partners. Field/state nodes declare
// on a class node; class/type-reference nodes bind the `type` of a cts.*
// species record. Their typed port specs are authoring contracts for those
// wires only — a declaration node is never a value source, and no data node
// can feed a class declare input — so the generic data-socket compatibility
// path must never apply to them.
export const DECLARATION_NODE_TYPES = Object.freeze(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);

export function declarationWireLegality({ sourceType = '', targetType = '', targetRecord = null, targetRecordKind = '' } = {}) {
  if ((sourceType === 'ctsField' || sourceType === 'ctsState') && targetType === 'ctsClass') return 'declares';
  // Children edges accept type-reference targets beside in-tree classes:
  // an org type's containment may name pack and other registry types
  // (SPEC §6 — the child edge's type list is not restricted to in-tree
  // declarations), the same freedom ref-field targets already have.
  if (sourceType === 'ctsClass' && (targetType === 'ctsClass' || targetType === 'ctsType')) return 'children';
  // A state wired into a state input becomes that state's child: the wire's
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

// Tree declarations compile from the canvas vocabulary (SPEC §20/§21 one
// tree): class nodes with wired field/state nodes become registry
// declarations; a state wired into a state nests under its parent
// (`parent.child`, nested machines); class-to-class wires are children
// edges with onRemove; transitions are declared by transition nodes
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
  // The state vocabulary is flat (SPEC §7): each state node contributes its
  // own value; nesting wires structure nodes but derive no paths. Unscoped
  // value tokens satisfy any bound type — scope is authored data, never a
  // precondition.
  const unscopedStateValues = new Set();
  const valuesByType = new Map();
  for (const node of nodes) {
    if (node.type !== 'ctsState' || !node.data?.value) continue;
    if (node.data.typeId == null) {
      unscopedStateValues.add(String(node.data.value));
      continue;
    }
    const values = valuesByType.get(node.data.typeId) || new Set();
    values.add(String(node.data.value));
    valuesByType.set(node.data.typeId, values);
  }

  for (const node of nodes) {
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

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (edge.label === 'nested' && source.type === 'ctsState' && target.type === 'ctsState') {
      if (source.data?.typeId !== target.data?.typeId) {
        diagnostics.push(`nesting ${labelOf(source)} under ${labelOf(target)}: states of one declared type only`);
      }
      if (source.id === target.id) diagnostics.push(`state ${labelOf(source)} cannot nest under itself`);
    }
    if (edge.label === 'children' && source.type === 'ctsClass' && target.type === 'ctsClass'
      && !classMayDeclareChildren(source.data?.class)) {
      diagnostics.push(`class ${labelOf(source)} (${source.data.class}): ${source.data.class} classes may not declare lineage children — containment belongs to item, group, or process classes`);
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
    const values = valuesByType.get(record.typeId);
    if (values && !values.has(target) && !unscopedStateValues.has(target)) {
      diagnostics.push(`${record.kind === 'cts.transition' ? 'transition' : 'construct'} ${record.id || '(unnamed)'}: state ${target} not declared for ${record.typeId}`);
    }
  }

  const classes = nodes.filter(node => node.type === 'ctsClass' && node.data?.typeId);
  for (const classNode of classes) {
    const seenAncestors = new Set();
    for (const state of nodes.filter(node => node.type === 'ctsState' && node.data?.typeId === classNode.data.typeId)) {
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

    const seenValues = new Set();
    for (const state of nodes.filter(node => node.type === 'ctsState' && node.data?.typeId === classNode.data.typeId)) {
      const value = String(state.data?.value || '');
      if (seenValues.has(value)) {
        diagnostics.push(`class ${labelOf(classNode)}: duplicate state name ${value}`);
      }
      seenValues.add(value);
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
      typeId: data.typeId,
      value: data.value,
      terminal: data.terminal === true,
      ...(data.label ? { label: data.label } : {}),
      ...(data.severity ? { severity: data.severity } : {}),
      ...(data.icon ? { icon: data.icon } : {}),
      ...(data.deadline ? { deadline: data.deadline } : {})
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
// in-tree type (children edge target, ref-field accepts) comes AFTER its
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
    if (descriptor?.base === 'ref') ids.push(...(descriptor.accepts || []));
  }
  return ids;
}

// Single-holder display-role authoring (SPEC §4): enabling `identifier`
// or `depiction` on one field node clears the flag from the previous
// holder among the sibling field nodes of the same declared type — the
// compile law is exactly-one (identifier) / at-most-one (depiction), and
// the toggle is the authored deviation (when no identifier is authored,
// the registry boundary mints the first string field). Mutates the
// canvas nodes' authoring state in place, like the enrichment pass; the
// caller owns the sync. An unbound field (no declared type) owns its own
// flag only — it declares nowhere yet.
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
      inputSpecs: [{ id: 'declare', label: 'fields · states', role: 'data', type: processType('json'), access: 'item', plane: 'declaration' }],
      outputSpecs: node.data?.typeId
        ? [{ id: 'type', label: node.data.typeId, role: 'data', type: processType('entityRef', { typeId: node.data.typeId }), access: 'item', plane: 'declaration' }]
        : []
    };
  }
  if (node.type === 'ctsField') {
    const isRef = node.data?.descriptor?.base === 'ref';
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
// Lifecycle summary of one class's declaration tree: its declared states
// (value, initial, terminal) and the state-to-state transition wires among
// them (with intents). Pure over the canvas arrays — the class inspector
// renders this and edits through the same nodes/edges, so panel authoring
// and tree authoring are one data model.
export function classLifecycleOf(nodes = [], edges = [], classNodeId = '', records = {}) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const stateNodes = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type' || edge.target !== classNodeId) continue;
    const source = nodeById.get(edge.source);
    if (source?.type === 'ctsState') stateNodes.set(source.id, source);
  }
  const stateIds = new Set(stateNodes.keys());
  // State-to-state wires declare nesting (SPEC §7): the wire's source is
  // the parent, the receiving (target) state its child. Structure only, no
  // initials; terminal is authored on the node.
  const nesting = edges
    .filter(edge => edge.role === 'type' && stateIds.has(edge.source) && stateIds.has(edge.target))
    .map(edge => ({
      edgeId: edge.id,
      parent: String(nodeById.get(edge.source)?.data?.value || ''),
      child: String(nodeById.get(edge.target)?.data?.value || '')
    }));
  const states = [...stateNodes.values()].map(node => ({
    nodeId: node.id,
    value: String(node.data?.value || ''),
    severity: node.data?.severity || null,
    icon: node.data?.icon || null,
    terminal: node.data?.terminal === true
  }));
  return { states, nesting };
}

export function interpretDeclarationEdges(nodes = [], edges = [], records = {}, previousBindings = {}, resolvers = {}, knownTypeIds = []) {
  const mutations = [];
  const bindings = {};
  const fieldCounts = new Map();
  const stateCounts = new Map();
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
    if ((source.type === 'ctsField' || source.type === 'ctsState') && target.type === 'ctsClass') {
      declaredBy.set(source.id, target.id);
      if (source.type === 'ctsField') fieldCounts.set(target.id, (fieldCounts.get(target.id) || 0) + 1);
      else stateCounts.set(target.id, (stateCounts.get(target.id) || 0) + 1);
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
  // the authored name).
  for (const [fieldNode, targetNode] of fieldEntryEdges) {
    const record = records[targetNode.data?.refId];
    if (record?.kind !== 'cts.field') continue;
    const name = String(fieldNode.data?.name || '').trim();
    if (!name) continue;
    const classNode = declaredBy.has(fieldNode.id) ? nodeById.get(declaredBy.get(fieldNode.id)) : null;
    const slot = slotFor(fieldNode.data?.descriptor || {}, classNode?.data?.class || 'file');
    const path = `${slot}.${camelCaseId(name)}`;
    if (record.inputDefaults?.field !== path) {
      mutations.push({ scope: 'record', recordId: targetNode.data.refId, key: 'inputDefaults.field', value: path });
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
    if (node.type === 'ctsField' || node.type === 'ctsState') {
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
      if (wired && (node.data?.descriptor?.base === 'ref')) {
        const accepts = wired.filter(typeId => Boolean(typeId));
        const current = node.data.descriptor.accepts || [];
        if (JSON.stringify(current) !== JSON.stringify(accepts)) {
          mutations.push({
            scope: 'node',
            nodeId: node.id,
            key: 'descriptor',
            value: { ...node.data.descriptor, accepts }
          });
        }
      }
    }
    if (node.type === 'ctsClass') {
      const fields = fieldCounts.get(node.id) || 0;
      const states = stateCounts.get(node.id) || 0;
      if (node.data?.fields !== fields) mutations.push({ scope: 'node', nodeId: node.id, key: 'fields', value: fields });
      if (node.data?.states !== states) mutations.push({ scope: 'node', nodeId: node.id, key: 'states', value: states });
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

const ENTITY_ORIGIN_OPERATION_KINDS = new Set([
  ...PRODUCER_ORIGIN_EFFECT_KINDS,
  'effect.createEntity',
  'effect.runProducer',
  'effect.runCommand',
  'effect.sendEntity',
  'effect.generateAttachment'
]);

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

// Services group from the operator registry (SPEC §8 s species): one item
// per registered service — dropping one binds the operator; the executable
// twin is the operator's declared command. The projected domain's
// `serviceContracts` is the single source: what is not registered is not
// offered.
export function servicesPaletteGroups(serviceContracts = {}) {
  // The fallback tab: services without a declared pack group. Grouped
  // services drop into their pack's section (packPaletteGroups).
  const items = Object.values(serviceContracts || {})
    .filter(service => service?.id && service.command && !service.group)
    .map(service => paletteItem(`service:${service.id}`, 'cts.service', {
      label: service.render?.label || service.id,
      description: service.render?.label || service.id,
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  return items.length ? [{ id: 'services', items }] : [];
}

// Pack-owned palette sections — the plugin-tab law (SPEC §8 palette law):
// a pack's declared data operations surface as the pack's own tab, like a
// Grasshopper plugin's component category. The documents pack's
// `tableData` tab carries xlsx/csv table decomposition (and, when
// declared, composition and management); the facade pack's `facade` tab
// carries cassette geometry extraction beside the solver. Ungrouped
// projections stay unlisted (the generic extract preset covers them).
export function packPaletteGroups(projectionContracts = {}, serviceContracts = {}) {
  const sections = new Map();
  const section = id => {
    if (!sections.has(id)) sections.set(id, { id, items: [] });
    return sections.get(id);
  };
  for (const projection of Object.values(projectionContracts || {})) {
    if (!projection?.group || !projection.typeId || !projection.id) continue;
    section(projection.group).items.push(paletteItem(`extract:${projection.typeId}:${projection.id}`, 'cts.read', {
      label: `${projection.label} · ${projection.typeId}`,
      description: `${projection.label} · ${projection.typeId}`,
      icon: 'pi pi-table',
      preset: { select: 'extract', typeId: projection.typeId, projection: projection.id }
    }));
  }
  for (const service of Object.values(serviceContracts || {})) {
    if (!service?.group || !service?.id || !service.command) continue;
    section(service.group).items.push(paletteItem(`service:${service.id}`, 'cts.service', {
      label: service.render?.label || service.id,
      description: service.render?.label || service.id,
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  }
  return [...sections.values()].filter(group => group.items.length);
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
    ...packPaletteGroups(domain.projectionContracts || {}, domain.serviceContracts || {}),
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
  if (kind.startsWith('cts.join')) return 'pi pi-arrows-merge';
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return kind.includes('logic') || kind.includes('compare') ? 'pi pi-sitemap' : 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}
