import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { CONSUMER_EFFECT_KINDS, TYPE_BOUND_SPECIES, carriesTypePin } from './node-catalog.js';
import { operationKindOf, describeType, normalizeOperator, typeIdOf, ctsFieldToProcessType, mergeTransitionNodeStates, transitionNodeStateTargets } from '../../cts/src/index.js';
// Single vocabulary seam: the species/operation table is re-exported, never
// imported from the type system package directly by app surfaces.
export { operationKindOf };
import { migrateV4Definition, resolveCtsDefinition, checkCtsGraphBindings, isCtsGraphDefinition, classMayDeclareChildren } from '../../cts/src/index.js';
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
// flows through here. v4 graphs migrate one-way to the species
// vocabulary (legacy `type` strings normalize to `typeId`), binding
// checks run beside it, and lowering to the executable working shapes
// happens exactly once, internally. Nothing outside this package
// resolves or lowers the vocabulary.
export function migrateProcessDefinition(data = {}, domain = {}) {
  return migrateV4Definition(data, domain);
}

export function prepareAuthoredDefinition(data = {}, domain = {}) {
  const wasCts = isCtsGraphDefinition(data);
  const { definition: migrated } = migrateV4Definition(data, domain);
  const { definition, diagnostics } = resolveCtsDefinition(migrated, domain);
  // Declaration-binding checks are the cts vocabulary's gate; v4-authored
  // graphs keep the compiler's own validation as their correctness gate.
  const errors = [...(wasCts ? checkCtsGraphBindings(migrated, domain) : []), ...diagnostics];
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
      paletteItem('remove', 'cts.remove'),
      paletteItem('joinProducers', 'cts.join')
    ]
  },
  {
    id: 'instances',
    items: [
      paletteItem('contextEntity', 'cts.read', { preset: { select: 'current' } }),
      paletteItem('findEntityById', 'cts.read', { preset: { select: 'byId' } }),
      paletteItem('findEntityByReference', 'cts.read', { preset: { select: 'byRef' } }),
      paletteItem('parentEntity', 'cts.read', { preset: { select: 'parent' } }),
      paletteItem('childEntities', 'cts.read', { preset: { select: 'children' } }),
      paletteItem('relatedEntities', 'cts.read', { preset: { select: 'related' } }),
      paletteItem('queryEntities', 'cts.read', { preset: { select: 'query' } }),
      // the field projection: entity in, one field's value out
      paletteItem('getField', 'cts.field')
    ]
  },
  {
    id: 'values',
    items: [
      paletteItem('literal', 'source.literalItem', { preset: { type: { base: 'string', nullable: false }, access: 'item', value: '' } }),
      paletteItem('logic', 'value.logic', { preset: { type: { base: 'string', nullable: true }, operation: 'eq' } }),
      paletteItem('text', 'value.string', { preset: { type: { base: 'string', nullable: false }, operation: 'concat' } }),
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
      paletteItem('makeList', 'collection.makeList'),
      paletteItem('collectArray', 'collection.packArray'),
      paletteItem('expandArray', 'collection.unpackArray'),
      paletteItem('joinLists', 'collection.concat'),
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
  if (sourceType === 'ctsClass' && targetType === 'ctsClass') return 'children';
  // A state wired into a state declares its PARENT status (nested
  // machines: the child compiles under `parent.child`). Transitions are
  // defined by transition nodes only — never by declaration wires.
  if (sourceType === 'ctsState' && targetType === 'ctsState') return 'nested';
  // A state wires into a status-bearing process node: it authors the
  // machine entry (on constructs) and the action's target state (on
  // status-mutating effects) — the wire IS the status value. The connect
  // gate additionally requires the landed input to be status-typed.
  if (sourceType === 'ctsState' && targetType === 'processNode'
    && (carriesTypePin(targetRecord || { kind: targetRecordKind })
      || ['cts.transition', 'effect.changeStatus', 'effect.archiveEntity'].includes(targetRecordKind))) {
    return 'entry';
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

export function compileTreeDeclarations(nodes = [], edges = [], records = {}) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const classes = nodes.filter(node => node.type === 'ctsClass' && node.data?.typeId);
  // Entry wires: a state wired into a process node's status input. On a
  // construct of the type it authors the machine entry AND the creation
  // state; on a status-mutating effect it targets the transition. The
  // entry for a class is the state wired into any construct bound to it
  // (by binds wire or recorded type).
  const nodeById0 = nodeById;
  const entryStatesByType = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type' || edge.label !== 'entry') continue;
    const source = nodeById0.get(edge.source);
    const target = nodeById0.get(edge.target);
    if (source?.type !== 'ctsState' || target?.type !== 'processNode') continue;
    const value = String(source.data?.value || '').trim();
    if (!value) continue;
    let boundType = target.data?.typeId || '';
    if (!boundType) {
      const bindWire = edges.find(candidate => (
        candidate.role === 'type'
        && (candidate.label === 'type' || candidate.label === 'binds')
        && candidate.target === edge.target
        && nodeById0.get(candidate.source)?.type === 'ctsClass'
      ));
      boundType = bindWire ? nodeById0.get(bindWire.source)?.data?.typeId : '';
    }
    if (!boundType) continue;
    const list = entryStatesByType.get(boundType) || [];
    if (!list.includes(value)) list.push(value);
    entryStatesByType.set(boundType, list);
  }
  const fieldsByType = new Map();
  const statesByType = new Map();
  const initialsByType = new Map();
  const childrenByType = new Map();
  const diagnostics = [];
  // Nesting wires: a state wired into a state of the same type compiles
  // under `parent.child` (nested machines). Transitions are declared by
  // transition nodes only; declaration wires never carry them.
  const parentValueOfStateNode = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source?.type !== 'ctsState' || target?.type !== 'ctsState') continue;
    if (source.data?.typeId && source.data.typeId !== target.data?.typeId) {
      diagnostics.push(`nesting ${source.data?.value || '(state)'} under ${target.data?.value || '(state)'}: states of one declared type only`);
      continue;
    }
    parentValueOfStateNode.set(source.id, String(target.data?.value || '').trim());
  }
  // Transition-node target statuses per bound type (SPEC §20): the
  // records map is the draft's processNodes — the same vocabulary the
  // persisted twin (declarationsFromCtsRecords) reads.
  const targetsByType = transitionNodeStateTargets(records);

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (source.type === 'ctsField' && target.type === 'ctsClass') {
      const map = fieldsByType.get(target.data.typeId) || new Map();
      const name = String(source.data.name || '').trim();
      const descriptor = source.data.descriptor || {};
      // Unfinished authoring is silent, not a diagnostic: an unnamed field
      // and an unset ref (no accepted targets picked yet) stay out of the
      // declaration until completed — exactly like any unsaved edit.
      const unset = descriptor.base === 'ref'
        && (!Array.isArray(descriptor.accepts) || !descriptor.accepts.length);
      if (name && !unset) {
        // The authored string is the user-plane label; the row key (the
        // field id) derives from it. Authors never meet id spelling rules
        // — "Field name Instant must be lowerCamelCase" is a defect, not
        // a diagnostic. A name that sanitizes to nothing (unfinished
        // non-latin input) stays out of the declaration, like any
        // unsaved edit.
        const fieldId = camelCaseId(name);
        if (fieldId) {
          try {
            describeType(descriptor);
            map.set(fieldId, {
              ...descriptor,
              ...(descriptor.label || fieldId === name ? {} : { label: name })
            });
          } catch (error) {
            diagnostics.push(`class ${classLabelOf(target)}: field ${name}: ${error.message}`);
          }
        }
      }
      fieldsByType.set(target.data.typeId, map);
    }
    if (source.type === 'ctsState' && target.type === 'ctsClass') {
      const map = statesByType.get(target.data.typeId) || new Map();
      const value = String(source.data.value || '').trim();
      const parentValue = parentValueOfStateNode.get(source.id) || '';
      if (value) {
        // A nested state compiles under `parent.child`; the machine
        // entry is top-level, so nested states never carry `initial`.
        const key = parentValue ? `${parentValue}.${value}` : value;
        map.set(key, {
          severity: source.data.severity || null,
          icon: source.data.icon || null
        });
        // The state node's `initial` flag is the other entry spelling: a
        // marked state satisfies the machine entry without wiring a
        // state node into the create node's status socket.
        if (source.data.initial === true && !parentValue) {
          const initials = initialsByType.get(target.data.typeId) || [];
          if (!initials.includes(value)) initials.push(value);
          initialsByType.set(target.data.typeId, initials);
        }
      }
      statesByType.set(target.data.typeId, map);
    }
    if (source.type === 'ctsClass' && target.type === 'ctsClass' && source.id !== target.id) {
      const parentTypeId = source.data?.typeId;
      const childTypeId = target.data?.typeId;
      if (!parentTypeId || !childTypeId) {
        diagnostics.push('children wire requires both classes to carry a type id');
        continue;
      }
      // SPEC §5 containment: a file's identity is its content — file
      // classes never declare lineage children. The wire is a completed
      // authoring gesture, so it diagnostics loudly instead of failing at
      // the registry with id-soup.
      if (!classMayDeclareChildren(source.data?.class)) {
        diagnostics.push(`class ${classLabelOf(source)} (${source.data.class}): ${source.data.class} classes may not declare lineage children — containment belongs to item, group, or process classes`);
        continue;
      }
      const map = childrenByType.get(parentTypeId) || new Map();
      const key = String(edge.data?.key || `${childTypeId}s`).trim();
      const entry = map.get(key) || { types: [], onRemove: edge.data?.onRemove || 'restrict' };
      if (!entry.types.includes(childTypeId)) entry.types.push(childTypeId);
      map.set(key, entry);
      childrenByType.set(parentTypeId, map);
    }
  }

  const declarations = classes.map(classNode => {
    const typeId = classNode.data.typeId;
    const states = statesByType.get(typeId) || new Map();
    // Transition-node target statuses (SPEC §20): per-value display
    // policy composes — tree severity/icon, then the transition node's
    // label/severity/icon winning where both declare the same value.
    const targets = targetsByType.get(typeId) || [];
    const statePolicies = new Map([...states.entries()].map(([value, flags]) => [value, { ...flags }]));
    for (const target of targets) {
      if (!target.value) continue;
      statePolicies.set(target.value, {
        ...(statePolicies.get(target.value) || {}),
        ...(target.label ? { label: target.label } : {}),
        ...(target.severity ? { severity: target.severity } : {}),
        ...(target.icon ? { icon: target.icon } : {})
      });
    }
    const declaration = {
      id: typeId,
      class: classNode.data.class,
      fields: Object.fromEntries([...(fieldsByType.get(typeId) || new Map()).entries()]),
      // SPEC §4 naming vocabulary: the authored name and glyph are
      // top-level declaration keys; per-state display policy rides
      // `render.states` (the registry boundary adopts it into the states
      // facet home — normalizeType moves it to states.main.render).
      ...(classNode.data.name ? { name: classNode.data.name } : {}),
      ...(classNode.data.glyph ? { glyph: classNode.data.glyph } : {}),
      ...([...statePolicies.values()].some(flags => flags.severity || flags.icon || flags.label)
        ? {
            render: {
              states: Object.fromEntries([...statePolicies.entries()]
                .filter(([, flags]) => flags.severity || flags.icon || flags.label)
                .map(([value, flags]) => [value, {
                  ...(flags.label ? { label: flags.label } : {}),
                  ...(flags.severity ? { severity: flags.severity } : {}),
                  ...(flags.icon ? { icon: flags.icon } : {})
                }]))
            }
          }
        : {}),
      ...(classNode.data.payload ? { payload: classNode.data.payload } : {}),
      // Declared migration steps (SPEC §11) ride the class node as
      // transient apply-time state written by the step dialog; the
      // designer clears them once the declaration post consumes them.
      ...(Array.isArray(classNode.data.migrate) && classNode.data.migrate.length
        ? { migrate: classNode.data.migrate }
        : {})
    };
    if (states.size) {
      // The entry comes from entry wires (a state wired into a construct
      // of this type) or the state node's `initial` flag. A sole wired
      // state is necessarily the entry; a sole flagged state likewise.
      // Ambiguity (disagreeing wires, multiple flagged states, or states
      // with neither signal) is a named diagnostic — never a default.
      const wiredEntries = (entryStatesByType.get(typeId) || []).filter(value => states.has(value));
      const flaggedInitials = (initialsByType.get(typeId) || []).filter(value => states.has(value));
      if (wiredEntries.length > 1) {
        diagnostics.push(`class ${classLabelOf(classNode)}: entry states disagree — ${wiredEntries.join(', ')}; wire exactly one entry state into the create node`);
      } else if (flaggedInitials.length > 1) {
        diagnostics.push(`class ${classLabelOf(classNode)}: multiple initial states — ${flaggedInitials.join(', ')}; mark exactly one as initial`);
      } else if (states.size > 1 && wiredEntries.length === 0 && flaggedInitials.length === 0) {
        diagnostics.push(`class ${classLabelOf(classNode)}: no initial state — mark one state initial or wire it into the create node`);
      } else {
        // The merged axis: tree values ∪ transition-node targets, wire
        // transitions ∪ the nodes' fan-out edges (from every other
        // declared value — from-state resolves dynamically, SPEC §20).
        const merged = mergeTransitionNodeStates({
          values: [...states.keys()],
          transitions: [],
          targets
        });
        declaration.states = {
          main: {
            initial: wiredEntries[0] || flaggedInitials[0] || [...states.keys()][0],
            values: merged.values
          }
        };
        declaration.transitions = merged.transitions
          .map(({ from, to, intent }) => (intent ? { from, to, intent } : { from, to }));
        // Terminal states are graph sinks — states with no outgoing
        // transition in the MERGED edge set — plus explicitly terminal
        // transition targets. Never hand-flagged: the transition graph IS
        // the machine, and its endpoints follow from it.
        declaration.states.main.terminal = merged.terminal;
        declaration.states.main = Object.freeze(declaration.states.main);
      }
    }
    const children = childrenByType.get(typeId);
    if (children?.size) declaration.edges = { children: Object.fromEntries(children.entries()) };
    const operators = Array.isArray(classNode.data.operators) ? classNode.data.operators : [];
    if (operators.length) {
      declaration.operators = {};
      for (const operator of operators) {
        const id = String(operator.id || '').trim();
        const triggers = (operator.triggers || []).filter(trigger => String(trigger.event || trigger.schedule || '').trim());
        try {
          normalizeOperator({
            id,
            species: operator.species,
            input: operator.input || null,
            output: operator.output || null,
            triggers,
            declaringType: typeId
          });
          declaration.operators[id] = {
            species: operator.species,
            ...(operator.input ? { input: operator.input } : {}),
            ...(operator.output ? { output: operator.output } : {}),
            triggers
          };
        } catch (error) {
          diagnostics.push(`class ${classLabelOf(classNode)}: operator ${id || '(unnamed)'}: ${error.message}`);
        }
      }
    }
    return declaration;
  });

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
      inputSpecs: [{ id: 'in', label: 'parent', role: 'data', type: processType('status'), access: 'item', plane: 'declaration' }],
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
// 3. the stored binding (palette preset, migration) — authored data, kept
//    only while it names a type that still exists (registry permitting).
// Removing the channel that supplied a binding clears it — and a binding
// that resolves to a type known nowhere (no bind wire, no registry and no
// tree declaration in `knownTypeIds`) is cleared too: after a reload the
// channel memory is gone, and without the known-type check a dangling
// binding would masquerade as authored data forever (producer outputs on
// unknown entity types, sockets that never materialize, wires filtered at
// save). Pure over the canvas arrays: returns only the mutations that
// differ from current state, so an unchanged graph evaluates to no writes.
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
  // State-to-state wires declare nesting (parent status), not
  // transitions — the machine's transitions come from transition nodes.
  const nesting = edges
    .filter(edge => edge.role === 'type' && stateIds.has(edge.source) && stateIds.has(edge.target))
    .map(edge => ({
      edgeId: edge.id,
      child: String(nodeById.get(edge.source)?.data?.value || ''),
      parent: String(nodeById.get(edge.target)?.data?.value || '')
    }));
  // End states are derived: terminal is a property of the machine, and
  // the machine's transitions come from transition nodes (their targets
  // fan from every other declared value — SPEC §20). The entry is
  // authored by wiring a state into a construct of this class (an entry
  // wire) — not by flagging the state.
  const classTypeId = String(nodeById.get(classNodeId)?.data?.typeId || '');
  const targets = (transitionNodeStateTargets(records).get(classTypeId) || [])
    .map(target => String(target.value || ''));
  const hasOutgoing = value => targets.some(target => target !== value);
  // constructs bound to this class: binds wires class -> processNode
  const boundConstructs = new Set(edges
    .filter(edge => edge.role === 'type' && (edge.label === 'type' || edge.label === 'binds') && edge.source === classNodeId)
    .map(edge => edge.target));
  const entryNodeIds = new Set(edges
    .filter(edge => edge.role === 'type' && edge.label === 'entry' && boundConstructs.has(edge.target))
    .map(edge => edge.source));
  const states = [...stateNodes.values()].map(node => ({
    nodeId: node.id,
    value: String(node.data?.value || ''),
    severity: node.data?.severity || null,
    icon: node.data?.icon || null,
    initial: entryNodeIds.has(node.id),
    terminal: !hasOutgoing(String(node.data?.value || ''))
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

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if ((source.type === 'ctsField' || source.type === 'ctsState') && target.type === 'ctsClass') {
      declaredBy.set(source.id, target.id);
      if (source.type === 'ctsField') fieldCounts.set(target.id, (fieldCounts.get(target.id) || 0) + 1);
      else stateCounts.set(target.id, (stateCounts.get(target.id) || 0) + 1);
    } else if ((source.type === 'ctsClass' || source.type === 'ctsType') && target.type === 'processNode') {
      bindEdges.push([source, target]);
    } else if (source.type === 'ctsState' && target.type === 'processNode') {
      // entry wire: the state value is the record's status target
      const value = String(source.data?.value || '').trim();
      const record = records[target.data?.refId];
      if (value && record && record.state?.to !== value) {
        mutations.push({ scope: 'record', recordId: target.data.refId, key: 'status.to', value });
      }
    } else if ((source.type === 'ctsClass' || source.type === 'ctsType') && target.type === 'ctsField') {
      const targets = refTargetsByField.get(target.id) || [];
      const typeId = source.data?.typeId;
      if (typeId && !targets.includes(typeId)) targets.push(typeId);
      refTargetsByField.set(target.id, targets);
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

  // Types known anywhere: tree class/type declarations plus the registry
  // view the designer resolves against. A record whose effective binding
  // names none of them is dangling — typically a bind wire whose class
  // node was deleted in an earlier session (channel memory resets on
  // reload, so the dead binding would otherwise read as authored data).
  // Clearing it here unbinds the sockets and producer outputs that the
  // unknown type minted, instead of failing activation with phantoms.
  // The check runs only when the caller supplies the registry vocabulary
  // (the designer always does — framework, pack, and org types). Without
  // it, an authored preset cannot be distinguished from a dangling binding
  // and must survive untouched; tree declarations alone never clear a
  // stored binding, they only extend the known set.
  const externalKnown = (Array.isArray(knownTypeIds) ? knownTypeIds : []).filter(Boolean);
  if (externalKnown.length) {
    const known = new Set([
      ...externalKnown,
      ...nodes
        .filter(node => node?.type === 'ctsClass' || node?.type === 'ctsType')
        .map(node => node?.data?.typeId)
        .filter(Boolean)
    ]);
    for (const [recordId, record] of Object.entries(records || {})) {
      if (!record) continue;
      const effective = bindings[recordId] !== undefined ? bindings[recordId] : typeIdOf(record);
      if (effective && !known.has(effective)) {
        bindings[recordId] = '';
        if (typeIdOf(record) !== '') {
          mutations.push({ scope: 'record', recordId, key: 'typeId', value: '' });
        }
      }
    }
  }

  return { mutations, bindings };
}

export function syncProcessNodeProducerOutputs(data = {}, node = {}) {
  if (!node.id) return [];
  const pruneOwnOutputs = () => {
    const producerOutputs = data.producerOutputs ||= {};
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (output?.nodeId === node.id) delete producerOutputs[producerOutputId];
    }
  };
  // The explicit producer join routes its output under the producer output
  // its configuration selects; it must never become a producer anchor itself.
  if (operationKindOf(node) === 'producer.join') {
    pruneOwnOutputs();
    return [];
  }
  // Consumer effects transform entities that arrived over an input wire:
  // they own no producer output and carry no producer identity of their own.
  if (CONSUMER_EFFECT_KINDS.includes(operationKindOf(node))) {
    pruneOwnOutputs();
    delete node.producerOutputId;
    return [];
  }
  const outputs = (node.outputs || []).filter(output => (
    output?.id && output.type?.base === 'entity' && output.type?.typeId
  ));
  const producerOutputs = data.producerOutputs ||= {};
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

  if (operationKindOf(node)?.startsWith('effect.') && outputIds.size === 1) {
    [node.producerOutputId] = outputIds;
  }
  return [...outputIds];
}

// Services group from the operator registry (SPEC §8 s species): one item
// per registered service — dropping one binds the operator; the executable
// twin is the operator's declared command. The projected domain's
// `serviceContracts` is the single source: what is not registered is not
// offered.
export function servicesPaletteGroups(serviceContracts = {}) {
  const items = Object.values(serviceContracts || {})
    .filter(service => service?.id && service.command)
    .map(service => paletteItem(`service:${service.id}`, 'cts.service', {
      label: service.render?.label || service.id,
      description: service.render?.label || service.id,
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  return items.length ? [{ id: 'services', items }] : [];
}

// Type catalog palette (SPEC §20/§21, L2): registry types are draggable
// composables — one bound construct per constructible type, plus one
// variant per declared construct operator (the org-authored `via`). One
// group beside the declaration items, labeled by the item's class in the
// description.
export function typeCatalogPaletteGroups(types = []) {
  const items = [];
  for (const entry of types) {
    if (!entry?.constructible) continue;
    // One construct variant per construction mode (SPEC §20/§4): the
    // default mode keeps the plain type label, additional modes get
    // `· mode` suffixes — the artifact-era protocol picker, now the
    // palette listing. `via` carries the actual default (protocols for
    // payload types, genericCreate for payload-less).
    const modes = (entry.modes && entry.modes.length ? entry.modes : [entry.via || 'genericCreate']);
    for (const mode of modes) {
      items.push(paletteItem(mode === modes[0] ? entry.id : `${entry.id}:${mode}`, 'cts.construct', {
        label: mode === modes[0] ? (entry.label || entry.id) : `${entry.label || entry.id} · ${mode}`,
        icon: entry.icon,
        description: entry.description || entry.id,
        preset: { typeId: entry.id, construction: { mode } }
      }));
    }
    for (const operatorId of entry.constructOperators || []) {
      items.push(paletteItem(`${entry.id}:${operatorId}`, 'cts.construct', {
        label: `${entry.label || entry.id} · ${operatorId}`,
        icon: entry.icon,
        description: entry.description || entry.id,
        preset: { typeId: entry.id, construction: { mode: operatorId } }
      }));
    }
  }
  return items.length ? [{ id: 'types', items: Object.freeze(items) }] : [];
}

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
