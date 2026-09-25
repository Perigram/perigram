import { cncContainment } from './relationships.js';

/**
 * Per-child summary field names. These are persisted `summary.*` contracts
 * written by the parent aggregator and read by entity surfaces; they stay
 * stable even though the hierarchy relation is derived from `cncContainment`.
 */
const COUNT_FIELD_BY_CHILD = {
  cassette: 'cassetteCount',
  queue: 'queueCount',
  cassette_instance: 'instanceCount',
  solve_run: 'runCount',
  sheet_design: 'sheetDesignCount',
  sheet: 'sheetCount',
  color: 'colorCount'
};

const SUM_FIELDS_BY_CHILD = {
  sheet: { area: 'totalArea' }
};

/**
 * Curated summary relations. Only these parent/child pairs carry persisted
 * summary aggregates; not every containment edge does. Each key is the
 * child type.
 */
const SUMMARY_CHILD_TYPES = new Set([
  'cassette',
  'queue',
  'cassette_instance',
  'solve_run',
  'sheet_design',
  'sheet',
  'color'
]);

/**
 * Summary count hierarchy derived from the canonical containment graph. Each
 * row scopes a child list under its declared parent and exposes the matching
 * count field name. This is a projection of `cncContainment`, not a parallel
 * parent table.
 */
export const cncSummaries = cncContainment
  .filter(relation => SUMMARY_CHILD_TYPES.has(relation.childType)
    && relation.parentType && relation.lineageKey)
  .map(relation => ({
    typeId: relation.childType,
    parentType: relation.parentType,
    parentIdKey: relation.lineageKey,
    countField: COUNT_FIELD_BY_CHILD[relation.childType]
      || `${relation.childType.replace(/_/g, '')}Count`,
    ...(SUM_FIELDS_BY_CHILD[relation.childType] ? { sumFields: SUM_FIELDS_BY_CHILD[relation.childType] } : {})
  }));
