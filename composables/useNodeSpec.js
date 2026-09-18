// Human-readable node specs for the designer's "?" tooltip: one line of
// what the node does (by operation kind / species, SPEC §8/§20), rendered
// beside the socket contract (name — type, access) the card already
// computes. Presentation only — never process data.
import { operationKindOf } from '~/packages/cts/src/index.js';

const SPEC_BY_KIND = {
  'cts.construct': 'Creates a new instance of the bound type. Inputs are the type\'s constructor: named fields (typed), payload upload for file types, and the initial state. Outputs the created instance.',
  'cts.mutate': 'Patches fields of instances arriving over the entity wire. Only wired field values are written; the instance is never replaced.',
  'cts.transition': 'Moves the bound type\'s state machine to the target state (optionally via a declared intent). Guards and effects come from the type\'s declaration.',
  'cts.remove': 'Hard-deletes the wired instances. Admin access; rendered only from the action manifest with confirmation.',
  'cts.command': 'Runs any registered command (the generic service wrapper). Pick the command in the inspector; its signature becomes the sockets.',
  'cts.service': 'Runs a registered service operator (pure computation: values in, values out — never touches instances directly). Bound to its operator at drop.',
  'cts.conversion': 'Converts the wired instance into a new instance of the operator\'s output type, recording provenance (inputs + versions).',
  'cts.read': 'Loads instances into the graph. `current` takes the instance from the screen/action context; `byId`/`byRef` look up; `parent`/`children`/`related` follow declared edges; `query` selects by predicate.',
  'cts.field': 'Extracts one field (a pure value) from a record — the entity-to-value gate before values/math/service nodes.',
  'cts.compose': 'Composes a fields/edges patch from values — feed it into construct/mutate sockets.',
  'cts.decompose': 'Splits an instance into its blocks (identity, data, specs, …) for per-block reads and writes.',
  'cts.join': 'Merges two instance streams of one type into a single producer path (the only legal same-type convergence).',
  'effect.runCommand': 'Runs a registered command: policy check, recording, typed inputs/outputs from the command contract.',
  'source.literalItem': 'A constant value (pick its type in one node).',
  'source.literalList': 'A constant list value.',
  'source.literalTree': 'A constant branched tree value.',
  'value.logic': 'Compares or combines values into a boolean (eq, gt, and, isNull, …).',
  'value.math': 'Arithmetic on numbers/quantities (unit-checked).',
  'value.string': 'Text operations (concat, split, replace, …).',
  'value.dateTime': 'Date/time arithmetic and differences.',
  'value.convertUnit': 'Converts a quantity\'s unit (mm → m, …); explicit node, never implicit.',
  'collection.makeList': 'Builds a list from up to four item sockets.',
  'collection.filter': 'Keeps list items whose aligned boolean mask is true (mask must match length).',
  'collection.dispatch': 'Splits a list into true/false branches by an aligned mask.',
  'collection.sort': 'Orders items by an aligned keys list (stable).',
  'collection.groupBy': 'Groups items by aligned keys into branches.',
  'collection.count': 'Counts list items.',
  'collection.concat': 'Concatenates two lists.',
  'tree.flatten': 'Flattens a data tree into a list.',
  'tree.graft': 'Re-branches a data tree.',
  'control.forEach': 'Runs the subgraph per tree branch/item: emits `each` (control), the item, its path and index; `done` when finished.',
  'control.if': 'Branches control flow on a boolean.',
  'producer.join': 'Merges two producer paths of one type (see cts.join).'
};

// v4 operation kinds (stored graphs, resolved twins) share the species
// descriptions — one vocabulary.
const V4_ALIAS = {
  'effect.createEntity': 'cts.construct',
  'effect.runProducer': 'cts.construct',
  'effect.updateEntity': 'cts.mutate',
  'effect.changeStatus': 'cts.transition',
  'effect.archiveEntity': 'cts.transition',
  'effect.deleteEntity': 'cts.remove',
  'effect.runCommand': 'cts.command',
  'effect.sendEntity': 'cts.command',
  'effect.generateAttachment': 'cts.conversion',
  'read.currentEntity': 'cts.read',
  'read.entityById': 'cts.read',
  'read.resolveEntityRef': 'cts.read',
  'read.parent': 'cts.read',
  'read.children': 'cts.read',
  'read.related': 'cts.read',
  'read.queryEntities': 'cts.read',
  'record.getField': 'cts.field',
  'record.composeBlock': 'cts.compose',
  'record.modifyBlock': 'cts.compose',
  'record.construct': 'cts.compose',
  'record.entityDraft': 'cts.compose',
  'record.deconstruct': 'cts.decompose',
  'record.getBlock': 'cts.decompose'
};

export function nodeSpecSummary(record = {}, formatType = () => 'value') {
  const kind = operationKindOf(record);
  const spec = SPEC_BY_KIND[record.kind]
    || SPEC_BY_KIND[V4_ALIAS[kind]]
    || SPEC_BY_KIND[kind]
    || (kind.startsWith('collection.') || kind.startsWith('tree.') ? 'List/tree algebra over values: selects, orders, reshapes.' : '');
  const parts = [];
  if (spec) parts.push(spec);
  return parts.join('\n');
}

// Socket lines: "name — Type · list · optional"
export function socketSpecLine(port = {}, formatType = () => 'value') {
  const bits = [formatType(port.type)];
  if (port.access && port.access !== 'item') bits.push(port.access);
  if (port.required === false) bits.push('optional');
  return `${port.label || port.id} — ${bits.join(' · ')}`;
}
