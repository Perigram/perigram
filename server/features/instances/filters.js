// Mongo projection of the canonical instance-filter tree
// (#shared/instance-filters): the wire's flat filter map normalizes into
// the tree with the declared lineage-key gate (an undeclared key is
// transport noise and never becomes a query path), then projects to the
// stored §3 shape. `and` merges into one query object — the flat transport
// cannot collide keys — `or`/`not` project to `$or`/`$nor`, and `contains`
// to an escaped case-insensitive regex. Lineage and `_id` equality match
// both stored id forms (string ids from dialogs and the effect boundary,
// ObjectIds from flexible-id writes) through the flexible-id helper.
import { filterFromFlatFilters } from '#shared/instance-filters/index.js';
import { toFlexibleId } from '../../utils/objectid.js';

export function listQueryFilter(filters = {}, declaredLineageKeys = new Set()) {
  const filter = filterFromFlatFilters(filters, { lineageKeys: declaredLineageKeys });
  return filter ? mongoFilterOf(filter) : {};
}

function mongoFilterOf(node) {
  if (node.and) return Object.assign({}, ...node.and.map(mongoFilterOf));
  if (node.or) return { $or: node.or.map(mongoFilterOf) };
  if (node.not) return { $nor: [mongoFilterOf(node.not)] };
  const path = storagePathOf(node.field);
  if (node.op === 'eq') {
    return { [path]: equalityValue(node.field, node.value) };
  }
  if (node.op === 'in') {
    return { [path]: { $in: node.value.flatMap(value => equalityForms(node.field, value)) } };
  }
  return { [path]: { $regex: escapeRegex(String(node.value)), $options: 'i' } };
}

// Filter-tree addresses are instance-shape reads; storage paths are the §3
// document form: the instance id address is `_id`, lineage addresses are
// their own storage paths, and field addresses live under `fields.`.
function storagePathOf(field) {
  if (field === '_id' || field === 'id') return '_id';
  if (field === 'states.main' || field.startsWith('lineage.')) return field;
  return `fields.${field}`;
}

function equalityValue(field, value) {
  const forms = equalityForms(field, value);
  return forms.length === 1 ? forms[0] : { $in: forms };
}

// Id-shaped addresses match both stored forms; every other address is an
// exact scalar.
function equalityForms(field, value) {
  if (field === '_id') return [toFlexibleId(value)];
  if (field.startsWith('lineage.')) {
    const flexible = toFlexibleId(value);
    return flexible === value ? [value] : [value, flexible];
  }
  return [value];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
