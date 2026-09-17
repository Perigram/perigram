import { describe, it, expect } from 'vitest';
import {
  quantity, convert, unify,
  rowToSchema, checkFields,
  createTypeRegistry, validateInstance, schemaFor,
  diffTypes, requireCompatible,
  evaluate, checkMatch,
  normalizeOperator,
  cncTypePack, partyTypes, nestingOperators, packFixtures
} from './index.js';

function packRegistry() {
  const registry = createTypeRegistry({ id: 'cnc-pack' });
  for (const type of [...partyTypes, ...cncTypePack]) registry.defineType(type);
  for (const operator of nestingOperators) normalizeOperator(operator);
  return registry;
}

describe('units (R3)', () => {
  it('unifies same units and declared conversions only', () => {
    expect(unify(quantity(1000, 'mm'), quantity(1, 'm'))).toEqual({ a: quantity(1, 'm'), b: quantity(1, 'm') });
    expect(() => unify(quantity(1, 'mm'), quantity(1, 'percent'))).toThrow(/Unit mismatch/);
    expect(convert(quantity(3, 'm'), 'mm')).toEqual(quantity(3000, 'mm'));
    expect(() => convert(quantity(3, 'min'), 'mm')).toThrow(/No declared conversion/);
  });
});

describe('closed rows (R1)', () => {
  it('rejects unknown and ill-typed fields', () => {
    const registry = packRegistry();
    const sheet = registry.getType('sheet');
    expect(validateInstance(sheet, {
      ...packFixtures.sheetInstance,
      fields: { ...packFixtures.sheetInstance.fields, rogue: 1 }
    })).toContain('closed row: unknown field rogue');
    expect(validateInstance(sheet, {
      ...packFixtures.sheetInstance,
      fields: { ...packFixtures.sheetInstance.fields, serial: quantity(1, 'mm') }
    })).toContainEqual(expect.stringMatching(/fields.serial/));
  });

  it('emits JSON Schema 2020-12 with closed rows and custom keywords', () => {
    const schema = schemaFor(packRegistry().getType('sheet'));
    expect(schema.$schema).toContain('2020-12');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.specs['x-quantity']).toBeUndefined();
    expect(rowToSchema('material', { thickness: { base: 'quantity', unit: 'mm' } }).properties.thickness['x-quantity']).toBe('mm');
  });
});

describe('typed edges (R2)', () => {
  it('rejects refs to undeclared targets and enforces onRemove vocabulary', () => {
    const registry = packRegistry();
    expect(registry.compile().errors).toEqual([]);
    registry.defineType({
      id: 'broken', class: 'file', fields: { link: { base: 'ref', accepts: ['nonexistent'] } }
    });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/unknown type nonexistent/));
    expect(() => registry.defineType({
      id: 'broken-2', class: 'file',
      edges: { relations: { r: { types: ['material'], onRemove: 'explode' } } }
    })).toThrow(/onRemove/);
  });

  it('rejects lineage cycles', () => {
    const registry = packRegistry();
    registry.defineType({ id: 'a', class: 'group', edges: { children: { c: { types: ['b'] } } } });
    registry.defineType({ id: 'b', class: 'group', edges: { children: { c: { types: ['a'] } } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/lineage cycle/));
  });
});

describe('class obligations (R6)', () => {
  it('enforces presets', () => {
    const registry = packRegistry();
    registry.defineType({ id: 'bad-item', class: 'item', fields: { note: { base: 'string' } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-item: item requires states/));
    registry.defineType({ id: 'bad-file', class: 'file', edges: { children: { c: { types: ['material'] } } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-file: file may not declare lineage children/));
    registry.defineType({ id: 'bad-party', class: 'party', scope: 'org', organizationId: 'org-1', fields: {} });
    expect(registry.compile('org-1').errors).toContainEqual(expect.stringMatching(/party types are framework-only/));
  });
});

describe('state totality (R4)', () => {
  it('rejects off-axis transitions, duplicate intents, unreachable terminals', () => {
    const registry = packRegistry();
    expect(() => registry.defineType({
      id: 'bad-states', class: 'item', fields: { serial: { base: 'string' } },
      states: { main: { initial: 'draft', values: ['draft'] } },
      transitions: [{ from: 'ghost', to: 'draft' }]
    })).toThrow(/from ghost/);
    expect(() => registry.defineType({
      id: 'bad-intents', class: 'item', fields: { serial: { base: 'string' } },
      states: { main: { initial: 'draft', values: ['draft', 'done'], terminal: ['done'] } },
      transitions: [
        { from: 'draft', to: 'done', intent: 'go' },
        { from: 'done', to: 'done', intent: 'go' }
      ]
    })).toThrow(/duplicate intent go/);
    registry.defineType({
      id: 'unreachable', class: 'item', fields: { serial: { base: 'string' } },
      states: { main: { initial: 'draft', values: ['draft', 'dead', 'alive'], terminal: ['dead'] } },
      transitions: [{ from: 'alive', to: 'dead' }]
    });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/terminal dead unreachable/));
  });

  it('keeps intents off types — they live on transition operators only', () => {
    expect(() => packRegistry().defineType({
      id: 'intentful', class: 'file', intents: { go: {} }, fields: {}
    })).toThrow(/intents live on transition operators/);
  });
});

describe('operators (R5, triggers)', () => {
  it('services and projections exchange V without refs', () => {
    expect(() => normalizeOperator({
      id: 'leaky', species: 'service',
      input: { base: 'ref', accepts: ['queue'] }
    })).toThrow(/must not contain Ref/);
    expect(nestingOperators.every(operator => normalizeOperator(operator).species)).toBeTruthy();
  });

  it('mutate/transition require Ref inputs; triggers are event-or-schedule', () => {
    expect(() => normalizeOperator({ id: 'x', species: 'mutate', input: { base: 'string' } })).toThrow(/Ref input/);
    expect(() => normalizeOperator({ id: 'y', species: 'construct', triggers: [{}] })).toThrow(/event or schedule/);
    const solve = packRegistry().getType('queue').operators.solve;
    expect(solve.triggers).toEqual([{ event: 'queue.nestingRequested' }]);
  });
});

describe('expressions (totality, CEL semantics)', () => {
  it('map/filter are the only iteration; step budget terminates runaway', () => {
    const list = { op: 'lit', value: [1, 2, 3, 4] };
    const doubled = evaluate({ op: 'map', list, var: 'x', body: { op: 'mul', args: [{ op: 'var', name: 'x' }, { op: 'lit', value: 2 }] } });
    expect(doubled).toEqual([2, 4, 6, 8]);
    const big = evaluate({ op: 'filter', list, var: 'x', body: { op: 'gt', args: [{ op: 'var', name: 'x' }, { op: 'lit', value: 2 }] } });
    expect(big).toEqual([3, 4]);
    expect(() => evaluate({ op: 'map', list: { op: 'map', list, var: 'a', body: { op: 'var', name: 'a' } }, var: 'b', body: { op: 'var', name: 'b' } }, {}, { steps: 3 })).toThrow(/step budget/);
  });

  it('quantity arithmetic unifies units; mismatch is an error', () => {
    const sum = evaluate({ op: 'add', args: [{ op: 'lit', value: quantity(500, 'mm') }, { op: 'lit', value: quantity(0.5, 'm') }] });
    expect(sum).toEqual(quantity(1, 'm'));
    expect(() => evaluate({ op: 'add', args: [{ op: 'lit', value: quantity(1, 'mm') }, { op: 'lit', value: quantity(1, 'min') }] })).toThrow(/Unit mismatch/);
  });

  it('match exhaustiveness is compile-checked', () => {
    const variant = { base: 'variant', tags: ['circle', 'rect'] };
    const partial = { op: 'match', expr: { op: 'lit', value: { tag: 'circle' } }, arms: { circle: { op: 'lit', value: 1 } } };
    expect(checkMatch(partial, variant)).toEqual(['match missing arm for rect']);
    expect(evaluate(partial)).toBe(1);
    expect(() => evaluate({ ...partial, expr: { op: 'lit', value: { tag: 'rect' } } })).toThrow(/not exhaustive/);
  });
});

describe('evolution (R7, refuse-on-diff)', () => {
  it('additive-nullable is minor; remove/retype are breaking and refused', () => {
    const v1 = { id: 'sheet', fields: { serial: { base: 'string' }, area: { base: 'quantity', unit: 'm2' } } };
    const minor = diffTypes(v1, { ...v1, fields: { ...v1.fields, foil: { base: 'quantity', unit: 'mm', nullable: true } } });
    expect(minor.breaking).toBe(false);
    expect(minor.changes).toEqual([{ severity: 'minor', kind: 'add-nullable-field', field: 'foil' }]);
    const removed = diffTypes(v1, { ...v1, fields: { serial: { base: 'string' } } });
    expect(removed.breaking).toBe(true);
    const retyped = diffTypes(v1, { ...v1, fields: { serial: { base: 'quantity', unit: 'mm' }, area: v1.fields.area } });
    expect(retyped.changes).toContainEqual({ severity: 'breaking', kind: 'retype-field', field: 'serial', from: expect.any(String), to: expect.any(String) });
    expect(() => requireCompatible(v1, { ...v1, fields: { serial: { base: 'string' } } })).toThrow(/breaking change/);
  });

  it('redefining with a breaking row is refused at the registry', () => {
    const registry = packRegistry();
    const sheet = registry.getType('sheet');
    expect(() => registry.defineType({
      ...sheet, fields: { ...sheet.fields, serial: { base: 'string', nullable: true } }
    })).not.toThrow();
    expect(() => registry.defineType({
      ...sheet, fields: {
        serial: sheet.fields.serial,
        material: sheet.fields.material,
        placed: sheet.fields.placed
      }
    })).toThrow(/breaking change/);
  });

  it('instances behind typeVersion are ill-typed', () => {
    const registry = packRegistry();
    const sheet = registry.getType('sheet');
    expect(validateInstance(sheet, { ...packFixtures.sheetInstance, typeVersion: 0 }))
      .toContainEqual(expect.stringMatching(/behind 1/));
  });
});

describe('tenancy (SPEC §4)', () => {
  it('resolves system + one org overlay; forbids shadowing', () => {
    const registry = packRegistry();
    registry.defineType({ id: 'org-flavor', class: 'file', scope: 'org', organizationId: 'org-1', fields: {} });
    registry.defineType({ id: 'org-flavor', class: 'file', scope: 'org', organizationId: 'org-2', fields: {} });
    expect(registry.listTypes('org-1').some(type => type.id === 'org-flavor')).toBe(true);
    expect(registry.listTypes('org-1').filter(type => type.id === 'org-flavor')).toHaveLength(1);
    expect(registry.listTypes('org-2').some(type => type.id === 'org-flavor')).toBe(true);
    expect(registry.listTypes(null).some(type => type.id === 'org-flavor')).toBe(false);
    registry.defineType({ id: 'material', class: 'file', scope: 'org', organizationId: 'org-1', fields: {} });
    expect(() => registry.resolveView('org-1')).toThrow(/shadows a system type/);
  });
});

describe('collapse table acceptance (SPEC §15, §19 core tier)', () => {
  it('the CNC pack compiles clean and instances validate', () => {
    const registry = packRegistry();
    const compiled = registry.compile();
    expect(compiled.errors).toEqual([]);
    expect([...compiled.types.keys()].sort()).toEqual([
      'cut-plan', 'facade', 'material', 'occs', 'organization', 'part', 'photo',
      'project', 'queue', 'sheet', 'solve-run', 'user'
    ]);
    expect(validateInstance(registry.getType('sheet'), packFixtures.sheetInstance)).toEqual([]);
    expect(validateInstance(registry.getType('queue'), packFixtures.queueInstance)).toEqual([]);
    expect(validateInstance(registry.getType('queue'), {
      ...packFixtures.queueInstance,
      fields: { ...packFixtures.queueInstance.fields, job: [{ item: { type: 'sheet', id: 'x' }, qty: 1 }] }
    })).toContainEqual(expect.stringMatching(/ref target sheet not in accepts/));
  });
});
