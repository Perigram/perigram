// Strangler converter (SPEC §15/§19 source flip): maps live
// @cutkit/domain-cnc declarations onto CTS type records. Pure mapping —
// this module never imports the domain; the app passes the declarations in.
//
// Field rows are extracted for real: legacy data/specs field schemas
// promote to row descriptors (nested paths group into records, unit numbers
// become quantities, entity refs become refs). Managed blocks stay in their
// facets — the projection re-sources them from the declared remainder until
// each facet collapses.

import { extractRow } from './field-schema-rows.js';

const CLASS_BY_TYPE = Object.freeze({
  artifact: 'file', artifact_template: 'file',
  cassette: 'file', cassette_design: 'file', cassette_instance: 'item',
  catalog: 'group', color: 'file', entity_revision: 'file',
  facade: 'file', facade_pattern: 'file', geometry_capture: 'process',
  layer_standard: 'file', library: 'group', machine: 'file', material: 'file',
  material_pile: 'item', nesting_run: 'process', organization: 'party',
  pen_template: 'file', process_definition: 'file', profile_template: 'file',
  project: 'group', queue: 'process', remnant: 'item', requisition: 'process',
  sheet: 'item', sheet_design: 'file', tool_profile: 'file', user: 'party',
  warehouse: 'file'
});

// Containment edges whose child is DERIVED from the parent (provenance in
// CTS, not lineage): the converter drops them as children and records a
// relation on the child instead.
const DERIVED_CONTAINMENT = Object.freeze(['cassette>cassette_design', 'nesting_run>sheet_design', 'sheet_design>sheet']);

export function classForEntityType(entityType) {
  return CLASS_BY_TYPE[entityType] || null;
}

// Old entity types are snake_case; CTS ids are kebab-case (the same casing
// the API routes already use).
export function toTypeId(entityType = '') {
  return String(entityType).replace(/_/g, '-');
}

export function convertCncEntities(entities = [], fieldSchemas = {}) {
  return entities.map(entity => {
    const className = CLASS_BY_TYPE[entity.type];
    if (!className) throw new Error(`no CTS class mapping for entity type ${entity.type}`);
    const declaration = {
      id: toTypeId(entity.type),
      class: className,
      scope: 'system',
      version: 1,
      fields: extractRow(fieldSchemas[entity.type] || []),
      render: { label: entity.type.replace(/_/g, ' ') }
    };
    return declaration;
  });
}

export function convertCncWorkflows(workflows = {}) {
  const byType = {};
  for (const [entityType, workflow] of Object.entries(workflows)) {
    const region = workflow?.regions?.main || workflow;
    const states = region.states || {};
    const values = Object.keys(states);
    if (!values.length) continue;
    byType[toTypeId(entityType)] = {
      states: {
        main: {
          initial: region.initial || values[0],
          values,
          terminal: values.filter(value => states[value]?.isTerminal)
        }
      },
      transitions: (region.transitions || []).map(transition => ({
        from: transition.from,
        to: transition.to,
        ...(transition.intent ? { intent: transition.intent } : {})
      }))
    };
  }
  return byType;
}

export function convertCncContainment(containment = []) {
  const childrenByParent = new Map();
  const relationsByOwner = new Map();
  for (const relation of containment) {
    const key = `${relation.parentType}>${relation.childType}`;
    if (DERIVED_CONTAINMENT.includes(key)) {
      const owner = relationsByOwner.get(toTypeId(relation.childType)) || { relations: {} };
      owner.relations[toTypeId(relation.parentType)] = { types: [toTypeId(relation.parentType)], onRemove: 'restrict' };
      relationsByOwner.set(toTypeId(relation.childType), owner);
      continue;
    }
    const parent = childrenByParent.get(toTypeId(relation.parentType)) || { children: {} };
    // The legacy lineage key rides on the children edge so the domain
    // projection can rebuild the containment contract exactly.
    parent.children[toTypeId(relation.childType)] = {
      types: [toTypeId(relation.childType)],
      onRemove: 'restrict',
      lineageKey: relation.lineageKey
    };
    childrenByParent.set(toTypeId(relation.parentType), parent);
  }
  return { childrenByParent, relationsByOwner };
}

export function convertAttachmentKinds(kinds = {}) {
  const traits = {};
  for (const [kind, definition] of Object.entries(kinds)) {
    traits[kind] = {
      mime: definition.mimeType || 'application/octet-stream',
      bucket: definition.bucket || null,
      preview: definition.preview?.mode || 'download',
      creation: definition.creation?.mode || 'workflow',
      editor: definition.editor?.mode || 'none'
    };
  }
  return traits;
}

// Whole-domain conversion: entities + field schemas + workflows +
// containment fused into one type-declaration list ready for
// createTypeRegistry().
export function convertCncDomain({ entities = [], workflows = {}, containment = [], fieldSchemas = {} } = {}) {
  const workflowByType = convertCncWorkflows(workflows);
  const { childrenByParent, relationsByOwner } = convertCncContainment(containment);
  return convertCncEntities(entities, fieldSchemas).map(declaration => ({
    ...declaration,
    ...(workflowByType[declaration.id] || {}),
    edges: {
      ...(childrenByParent.get(declaration.id) || {}),
      ...(relationsByOwner.get(declaration.id) || {})
    }
  }));
}
