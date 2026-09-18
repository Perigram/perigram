// Source-flip acceptance gate (SPEC §19 "Source flip"): for every system
// type, the CTS projection must equal the legacy tables it replaces —
// fieldSchemas, workflows, containment, entities, relations. The projection
// owns the translation; the legacy tables remain only as the declared
// remainder for facets that have not collapsed yet.
import { describe, it, expect } from 'vitest';
import { createTypeRegistry, convertCncDomain, projectDomainFromView } from '../index.js';
import {
  cncEntities, cncWorkflows, cncContainment, cncEntityFieldSchemas, cncDomain
} from '../../../domain-cnc/src/index.js';

function systemRegistry() {
  const registry = createTypeRegistry({ id: 'source-flip' });
  for (const declaration of convertCncDomain({
    entities: cncEntities, workflows: cncWorkflows, containment: cncContainment,
    fieldSchemas: cncEntityFieldSchemas
  })) {
    registry.defineType(declaration);
  }
  return registry;
}

const normalizeField = field => JSON.parse(JSON.stringify({
  path: field.path,
  block: field.block,
  type: field.type,
  writable: field.writable,
  constructible: field.constructible,
  readable: field.readable,
  label: field.label,
  i18n: field.i18n || '',
  display: field.display || '',
  role: field.role || ''
}));

describe('source flip: system types project byte-identically', () => {
  it('the whole converted domain compiles clean with real rows', () => {
    const compiled = systemRegistry().compile();
    expect(compiled.errors).toEqual([]);
    expect(compiled.types.size).toBe(cncEntities.length);
  });

  it('field schemas: row synthesis equals the legacy data/specs entries', () => {
    const projected = projectDomainFromView(systemRegistry(), null, cncDomain);
    for (const entity of cncEntities) {
      const legacy = cncEntityFieldSchemas[entity.type];
      const got = projected.fieldSchemas[entity.type] || [];
      const legacyByPath = new Map(legacy.map(field => [field.path, normalizeField(field)]));
      const gotByPath = new Map(got.map(field => [field.path, normalizeField(field)]));
      const paths = new Set([...legacyByPath.keys(), ...gotByPath.keys()]);
      for (const path of paths) {
        expect(gotByPath.get(path) ?? null, `${entity.type} :: ${path}`).toEqual(legacyByPath.get(path) ?? null);
      }
    }
  });

  it('workflows project to the exact legacy shape (raw, not just normalized)', () => {
    const projected = projectDomainFromView(systemRegistry(), null, cncDomain);
    for (const [entityType, workflow] of Object.entries(cncWorkflows)) {
      expect(projected.workflows[entityType], entityType).toEqual(workflow);
    }
  });

  it('containment rebuilds from children edges plus the derivation remainder', () => {
    const projected = projectDomainFromView(systemRegistry(), null, cncDomain);
    const key = relation => `${relation.parentType}>${relation.childType}:${relation.lineageKey}`;
    expect(new Set(projected.containment.map(key))).toEqual(new Set(cncContainment.map(key)));
  });

  it('entities, relations, commands, attachment kinds pass through untouched', () => {
    const projected = projectDomainFromView(systemRegistry(), null, cncDomain);
    // entities: the view is authoritative — every converted type maps to
    // its legacy entity row (order preserved through the conversion order)
    expect(projected.entities).toEqual(cncDomain.entities);
    expect(projected.relations).toEqual(cncDomain.relations);
    expect(projected.commands).toBe(cncDomain.commands);
    expect(projected.attachmentKinds).toBe(cncDomain.attachmentKinds);
    // construction: legacy entries pass through; view types without legacy
    // construction synthesize generic creation
    expect(Object.keys(cncDomain.construction).every(key => projected.construction[key] === cncDomain.construction[key])).toBe(true);
    expect(Object.values(projected.construction).filter(entry => entry?.modes?.[0] === 'genericCreate').length).toBeGreaterThan(0);
    expect(projected.fieldAccess).toBe(cncDomain.fieldAccess);
  });
});
