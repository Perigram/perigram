// Builder edit model: the user-facing projection of the
// canonical filter tree. One combinator over predicate rows with per-row
// negation — the surface AND/OR/NOT is made of. Pure data and functions.

import { normalizeFilter, FILTER_OPS } from './index.js';

// A builder row is `{ field, op, value, negate }` where `op` is one of the
// tree operators and `negate` wraps the predicate in `not`. Rows with
// missing pieces normalize to no-ops through the tree's own rules.
function rowToPredicate(row) {
  if (!row || typeof row !== 'object') return null;
  const { field, op, value, negate } = row;
  if (!FILTER_OPS.includes(op)) return null;
  const predicate = normalizeFilter({ field, op, value });
  if (!predicate) return null;
  return negate ? { not: predicate } : predicate;
}

// filterFromBuilderRows(rows, combinator): compose the edit model into the
// canonical tree. Incomplete rows drop; an empty group is the match-all
// null; single surviving children collapse per normalizeFilter.
export function filterFromBuilderRows(rows = [], combinator = 'and') {
  const key = combinator === 'or' ? 'or' : 'and';
  const children = (Array.isArray(rows) ? rows : [])
    .map(rowToPredicate)
    .filter(Boolean);
  return normalizeFilter(children.length ? { [key]: children } : null);
}

// builderRowsFromFilter(filter): decompose a tree the builder composed —
// one combinator group over (optionally negated) predicates, including the
// collapsed single-predicate form. Foreign shapes (nested groups, partial
// nests) return null instead of being corrupted into rows.
export function builderRowsFromFilter(filter) {
  if (!filter || typeof filter !== 'object') return null;
  const unwrap = node => {
    if (node.field) return { field: node.field, op: node.op, value: node.value, negate: false };
    if (node.not && node.not.field) {
      return { field: node.not.field, op: node.not.op, value: node.not.value, negate: true };
    }
    return null;
  };
  const group = filter.and ? { key: 'and', children: filter.and }
    : filter.or ? { key: 'or', children: filter.or }
      : { key: 'and', children: [filter] };
  if (!Array.isArray(group.children)) return null;
  const rows = group.children.map(unwrap);
  if (rows.some(row => !row)) return null;
  return { combinator: group.key, rows };
}

