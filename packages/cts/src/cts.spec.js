import { describe, it, expect } from 'vitest';
import {
  quantity, convert, unify,
  createTypeRegistry, schemaFor, normalizeType,
  planTypeMigration,
  evaluate, checkValue, validateConstraints,
  normalizeOperator,
  compileClientBundle,
  cncTypePack, frameworkTypes,
  classMayDeclareChildren, lineageKeyForParent,
  declarationsFromCtsRecords,
  projectDomainFromView,
  payloadAccepts
} from './index.js';
import { rowToSchema } from './rows.js';
import { diffTypes, requireCompatible } from './diff.js';

function packRegistry() {
  const registry = createTypeRegistry({ id: 'cnc-pack' });
  for (const type of [
    { id: 'organization', class: 'party', name: 'Organization', fields: { name: { base: 'string', identifier: true }, email: { base: 'string', nullable: true } } },
    { id: 'user', class: 'party', name: 'User', fields: { email: { base: 'string' }, name: { base: 'string', nullable: true, identifier: true } } },
    ...cncTypePack
  ]) registry.defineType(type);
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

describe('append-only mutability capability', () => {
  it('preserves the capability and rejects unknown values', () => {
    const declaration = normalizeType({
      id: 'audit-record',
      class: 'item',
      name: 'Audit record',
      mutability: 'append-only',
      fields: { name: { base: 'string', identifier: true } }
    });
    expect(declaration.mutability).toBe('append-only');
    expect(() => normalizeType({
      id: 'bad-record',
      class: 'item',
      name: 'Bad record',
      mutability: 'immutable',
      fields: { name: { base: 'string', identifier: true } }
    })).toThrow(/mutability must be mutable or append-only/);
  });
});

describe('closed rows (R1)', () => {
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
    expect(() => registry.defineType({
      id: 'broken-3', class: 'file',
      edges: { relations: { r: { types: ['material'], unlink: 'vaporize' } } }
    })).toThrow(/unlink/);
    registry.defineType({
      id: 'ref-owner', class: 'file',
      fields: { partner: { base: 'ref', accepts: ['material'], unlink: 'vanish' } }
    });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/fields\.partner unlink/));
  });

  it('projects a declared unlink policy onto relation contracts', () => {
    const registry = packRegistry();
    registry.defineType({
      id: 'edge-owner', class: 'file',
      edges: { relations: { partners: { types: ['material'], unlink: 'delete' } } }
    });
    registry.defineType({
      id: 'field-owner', class: 'file',
      fields: { mate: { base: 'ref', accepts: ['material'], unlink: 'delete' } }
    });
    const projection = projectDomainFromView(registry, null);
    expect(projection.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerType: 'edge-owner', key: 'partners', unlink: 'delete' }),
      expect.objectContaining({ ownerType: 'field-owner', key: 'mate', unlink: 'delete' })
    ]));
    // Entries without an authored policy carry none — detach is the
    // absence, never a stamped value.
    expect(projection.relations.some(relation => relation.key === 'placed-on' && relation.unlink)).toBe(false);
  });

  it('rejects lineage cycles', () => {
    const registry = packRegistry();
    registry.defineType({ id: 'a', class: 'group', edges: { children: { c: { types: ['b'] } } } });
    registry.defineType({ id: 'b', class: 'group', edges: { children: { c: { types: ['a'] } } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/lineage cycle/));
  });

  it('accepts recursive containment — a type naming itself as its own child (SPEC §6)', () => {
    const registry = packRegistry();
    registry.defineType({
      id: 'assembly', class: 'item',
      fields: { name: { base: 'string', identifier: true } },
      edges: { children: { parts: { types: ['assembly', 'material'] } } }
    });
    expect(registry.compile().errors).toEqual([]);
    // Self and foreign children share one declared lineage key.
    expect(registry.getType('assembly').edges.children.parts.lineageKey).toBe('assemblyId');
  });

  it('stamps every children edge with its declared storage lineageKey (SPEC §6)', () => {
    const registry = packRegistry();
    registry.defineType({
      id: 't-parent', class: 'group',
      edges: {
        children: {
          // Map key is authoring identity; the storage key derives from
          // the declaring type id when nothing is authored.
          kids: { types: ['part'] },
          crates: { types: ['part'], lineageKey: 'crateId' }
        }
      }
    });
    const edges = registry.getType('t-parent').edges.children;
    expect(edges.kids.lineageKey).toBe('tParentId');
    expect(edges.crates.lineageKey).toBe('crateId');
    // The helper is the single derivation home other layers import.
    expect(lineageKeyForParent('t-parent')).toBe('tParentId');
  });
});

describe('class obligations (R6)', () => {
  it('normalizes, type-checks, and asynchronously evaluates authored instance constraints', async () => {
    const registry = createTypeRegistry();
    registry.defineType({
      id: 'invoice', class: 'item', scope: 'system',
      fields: { code: { base: 'string', identifier: true }, amount: { base: 'number' } }
    });
    registry.defineType({
      id: 'account', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        invoices: { base: 'list', itemType: { base: 'ref', accepts: ['invoice'] } }
      },
      constraints: [{
        id: 'positive-invoice-total',
        message: 'Invoice total must be positive',
        expression: {
          op: 'gt',
          args: [
            {
              op: 'sum',
              list: { op: 'related', key: 'invoices' },
              var: 'invoice',
              body: { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] }
            },
            { op: 'lit', value: 0 }
          ]
        }
      }]
    });
    const compiled = registry.compile();
    expect(compiled.errors.filter(error => error.includes('type account: constraints'))).toEqual([]);
    const type = registry.getType('account');
    await expect(validateConstraints(type, { _id: 'a-1', type: 'account' }, {
      resolveRelation: async () => [{ amount: 4 }, { amount: 6 }]
    })).resolves.toEqual([]);
    await expect(validateConstraints(type, { _id: 'a-1', type: 'account' }, {
      resolveRelation: async () => [{ amount: -4 }]
    })).resolves.toEqual(['constraint positive-invoice-total: Invoice total must be positive']);
  });

  it('normalizes scoped exact uniqueness constraints and type-checks nested scalar paths', async () => {
    const registry = createTypeRegistry();
    registry.defineType({
      id: 'unique-customer', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        profile: { base: 'record', fields: { email: { base: 'string' } } }
      },
      constraints: [{
        id: 'unique-email',
        kind: 'unique',
        scope: 'global',
        field: 'profile.email',
        equality: 'exact',
        nulls: 'ignore'
      }]
    });
    expect(registry.compile().errors.filter(error => error.includes('unique-customer: unique constraint'))).toEqual([]);
    expect(registry.getType('unique-customer').constraints[0]).toEqual({
      id: 'unique-email',
      kind: 'unique',
      scope: 'global',
      field: 'profile.email',
      equality: 'exact',
      nulls: 'ignore'
    });
    await expect(validateConstraints(registry.getType('unique-customer'), { fields: { profile: { email: 'a@example.test' } } })).resolves.toEqual([]);
  });

  it('rejects uniqueness on unknown and non-scalar fields and enforces organization scope', () => {
    const registry = createTypeRegistry();
    registry.defineType({
      id: 'bad-unique-path', class: 'item', scope: 'system',
      fields: { code: { base: 'string', identifier: true } },
      constraints: [{ id: 'unique-missing', kind: 'unique', scope: 'global', field: 'missing' }]
    });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-unique-path: unique constraint unique-missing references unknown/));

    expect(() => registry.defineType({
      id: 'wrong-unique-scope', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { code: { base: 'string', identifier: true } },
      constraints: [{ id: 'unique-code', kind: 'unique', scope: 'global', field: 'code' }]
    })).toThrow(/requires scope organization/);
  });

  it('enforces presets', () => {
    const registry = packRegistry();
    // Items carry no state obligation (SPEC §7): state vocabularies are
    // process-graph authoring, and a bare item defines cleanly.
    expect(() => registry.defineType({
      id: 'bare-item', class: 'item', scope: 'system',
      fields: { name: { base: 'string' } }
    })).not.toThrow();
    registry.defineType({ id: 'bad-file', class: 'file', edges: { children: { c: { types: ['material'] } } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-file: file may not declare lineage children/));
    registry.defineType({ id: 'bad-party', class: 'party', scope: 'org', organizationId: 'org-1', fields: {} });
    expect(registry.compile('org-1').errors).toContainEqual(expect.stringMatching(/party types are framework-only/));
    // Parties are auth principals (SPEC §13 readable principals): no
    // declared containment may target them — membership is party-side.
    registry.defineType({ id: 'party-child', class: 'group', scope: 'system', fields: {}, edges: { children: { folks: { types: ['user'] } } } });
    expect(registry.compile().errors).toContainEqual(
      expect.stringMatching(/party-child: children.folks may not target party type user/));
  });

  it('exposes the containment predicate the authoring surfaces gate on', () => {
    expect(classMayDeclareChildren('file')).toBe(false);
    expect(classMayDeclareChildren('party')).toBe(false);
    expect(classMayDeclareChildren('item')).toBe(true);
    expect(classMayDeclareChildren('group')).toBe(true);
    expect(classMayDeclareChildren('process')).toBe(true);
  });

  it('checks relation target domains: boolean vocabulary, target-row paths (SPEC §6)', () => {
    // The framework party declarations carry the derived `roles` row the
    // domain vocabulary row-checks against.
    const registry = createTypeRegistry({ id: 'relation-domains' });
    for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
    registry.defineType({
      id: 'order', class: 'item', scope: 'system',
      fields: {
        assignee: { base: 'ref', accepts: ['user'], where: { op: 'in', args: [{ op: 'lit', value: 'role-operator' }, { op: 'field', path: ['value', 'roles'] }] } }
      }
    });
    expect(registry.compile().errors.filter(error => error.includes('assignee'))).toEqual([]);

    registry.defineType({
      id: 'bad-order', class: 'item', scope: 'system',
      fields: { owner: { base: 'ref', accepts: ['user'], where: { op: 'map' } } }
    });
    expect(registry.compile().errors).toContainEqual(
      expect.stringMatching(/bad-order: fields.owner where \(target user\): op map is not boolean vocabulary/));

    registry.defineType({
      id: 'invoice', class: 'item', scope: 'system',
      fields: { code: { base: 'string', identifier: true }, amount: { base: 'number' } }
    });
    registry.defineType({
      id: 'account', class: 'item', scope: 'system',
      fields: { code: { base: 'string', identifier: true }, invoices: { base: 'list', itemType: { base: 'ref', accepts: ['invoice'] } } }
    });
    registry.defineType({
      id: 'typed-nested-order', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        owner: {
          base: 'ref',
          accepts: ['account'],
          where: {
            op: 'exists',
            list: { op: 'related', key: 'invoices' },
            var: 'invoice',
            body: { op: 'gt', args: [
              { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] },
              { op: 'lit', value: 0 }
            ] }
          }
        }
      }
    });
    expect(registry.compile().errors.filter(error => error.includes('typed-nested-order'))).toEqual([]);

    registry.defineType({
      id: 'bad-nested-predicate', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        owner: {
          base: 'ref',
          accepts: ['account'],
          where: {
            op: 'exists',
            list: { op: 'related', key: 'invoices' },
            var: 'invoice',
            body: { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] }
          }
        }
      }
    });
    expect(registry.compile().errors).toContain(
      'type bad-nested-predicate: fields.owner where (target account): exists body must be boolean, got number');

    registry.defineType({
      id: 'bad-root-predicate', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true }, owner: { base: 'ref', accepts: ['user'], where: { op: 'lit', value: 7 } } }
    });
    expect(registry.compile().errors).toContain(
      'type bad-root-predicate: fields.owner where (target user): predicate must be boolean, got number');

    registry.defineType({
      id: 'bad-typed-order', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        owner: {
          base: 'ref',
          accepts: ['user'],
          where: { op: 'exists', list: { op: 'related', key: 'missing' }, var: 'x', body: { op: 'lit', value: true } }
        }
      }
    });
    expect(registry.compile().errors).toContain(
      'type bad-typed-order: fields.owner where (target user): related key missing is not a declared relation or ref field on user');

    registry.defineType({
      id: 'bad-sum-predicate', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        owner: {
          base: 'ref',
          accepts: ['account'],
          where: {
            op: 'gt',
            args: [
              {
                op: 'sum',
                list: { op: 'related', key: 'invoices' },
                var: 'invoice',
                body: { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['code'] }
              },
              { op: 'lit', value: 0 }
            ]
          }
        }
      }
    });
    expect(registry.compile().errors).toContain(
      'type bad-sum-predicate: fields.owner where (target account): sum requires a numeric or quantity body, got string');

    registry.defineType({
      id: 'typed-containment-order', class: 'item', scope: 'system',
      fields: {
        code: { base: 'string', identifier: true },
        owner: {
          base: 'ref',
          accepts: ['facade'],
          where: { op: 'exists', list: { op: 'children' }, var: 'part', body: { op: 'lit', value: true } }
        }
      }
    });
    expect(registry.compile().errors.filter(error => error.includes('typed-containment-order'))).toEqual([]);

    registry.defineType({
      id: 'off-row-order', class: 'item', scope: 'system',
      fields: { owner: { base: 'ref', accepts: ['user'], where: { op: 'eq', args: [{ op: 'field', path: ['value', 'ghost'] }, { op: 'lit', value: 1 }] } } }
    });
    expect(registry.compile().errors).toContainEqual(
      expect.stringMatching(/off-row-order: fields.owner where \(target user\): field ghost outside the row/));
  });
});

describe('intents (R7)', () => {
  it('keeps intents off types — they live on transition operators only', () => {
    expect(() => packRegistry().defineType({
      id: 'intentful', class: 'file', intents: { go: {} }, fields: {}
    })).toThrow(/intents live on transition operators/);
  });
});

describe('draft declaration records (SPEC §7/§20)', () => {
  it('declarationsFromCtsRecords projects classes and fields; state records declare no type facet', () => {
    const records = {
      cls: { id: 'cls', kind: 'class', typeId: 't-goo-1', class: 'file' },
      name: { id: 'name', kind: 'field', typeId: 't-goo-1', name: 'title', descriptor: { base: 'string', identifier: true } },
      goo: { id: 'goo', kind: 'state', typeId: 't-goo-1', value: 'GOO', initial: true, terminal: false },
      changed: { id: 'changed', kind: 'state', typeId: 't-goo-1', value: 'CHANGED', initial: false, terminal: true }
    };
    const [declaration] = declarationsFromCtsRecords(records, {}, {
      nodes: [
        { id: 'cls', type: 'ctsClass', data: { refId: 'cls' } },
        { id: 'goo', type: 'ctsState', data: { refId: 'goo' } },
        { id: 'changed', type: 'ctsState', data: { refId: 'changed' } }
      ],
      edges: [
        { id: 'd1', source: 'goo', target: 'cls', role: 'type', label: 'state' },
        { id: 'd2', source: 'changed', target: 'cls', role: 'type', label: 'state' }
      ]
    });
    expect(declaration).toEqual({
      id: 't-goo-1',
      class: 'file',
      fields: { title: { base: 'string', identifier: true } }
    });
    const registry = createTypeRegistry({ id: 'record-projection-check' });
    registry.defineType(declaration);
    expect(registry.compile().errors).toEqual([]);
  });
});

describe('operators (R5, triggers)', () => {
  it('services and projections exchange V without refs', () => {
    expect(() => normalizeOperator({
      id: 'leaky', species: 'service',
      input: { base: 'ref', accepts: ['queue'] }
    })).toThrow(/must not contain Ref/);
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

  it('in is list membership (role-domain boolean vocabulary)', () => {
    const hasRole = role => ({
      op: 'in',
      args: [{ op: 'lit', value: role }, { op: 'field', path: ['value', 'roles'] }]
    });
    expect(evaluate(hasRole('operator'), { value: { roles: ['operator', 'viewer'] } })).toBe(true);
    expect(evaluate(hasRole('admin'), { value: { roles: ['operator'] } })).toBe(false);
    expect(() => evaluate(hasRole('admin'), { value: { roles: 'operator' } })).toThrow(/in requires a list/);
  });

  it('currency stays in integer minor units (rows and arithmetic)', () => {
    expect(checkValue({ base: 'quantity', unit: 'currency' }, quantity(1250, 'currency'))).toEqual([]);
    expect(checkValue({ base: 'quantity', unit: 'currency' }, quantity(12.5, 'currency')))
      .toEqual(['currency quantities are integer minor units (e.g. cents)']);
    const total = evaluate({ op: 'add', args: [{ op: 'lit', value: quantity(500, 'currency') }, { op: 'lit', value: quantity(250, 'currency') }] });
    expect(total).toEqual(quantity(750, 'currency'));
    expect(() => evaluate({ op: 'div', args: [{ op: 'lit', value: quantity(100, 'currency') }, { op: 'lit', value: quantity(3, 'currency') }] }))
      .toThrow(/integer minor units/);
  });

  it('refs carry an optional revision pin (SPEC §24 version fabric)', () => {
    const descriptor = { base: 'ref', accepts: ['sheet'] };
    expect(checkValue(descriptor, { type: 'sheet', id: 'x' })).toEqual([]);
    expect(checkValue(descriptor, { type: 'sheet', id: 'x', revision: 'rev-1' })).toEqual([]);
    expect(checkValue(descriptor, { type: 'sheet', id: 'x', revision: 3 }))
      .toEqual(['ref revision pin must be a non-empty revision id']);
    expect(checkValue(descriptor, { type: 'sheet', id: 'x', revision: '' }))
      .toEqual(['ref revision pin must be a non-empty revision id']);
  });

  it('match evaluates the armed tag and throws on a missing arm', () => {
    const partial = { op: 'match', expr: { op: 'lit', value: { tag: 'circle' } }, arms: { circle: { op: 'lit', value: 1 } } };
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

  it('added children edges are minor; removals are breaking', () => {
    const v1 = {
      id: 'item',
      fields: { name: { base: 'string' } },
      edges: { children: { batch: { typeId: 'batch' } } }
    };
    const additive = diffTypes(v1, {
      ...v1,
      edges: { children: { batch: { typeId: 'batch' }, kit: { typeId: 'kit' } } }
    });
    expect(additive.breaking).toBe(false);
    expect(additive.changes).toEqual([
      { severity: 'minor', kind: 'add-edge', edge: 'children.kit' }
    ]);
    const removedEdge = diffTypes(v1, { ...v1, edges: {} });
    expect(removedEdge.changes).toContainEqual({
      severity: 'breaking',
      kind: 'remove-edge',
      edge: 'children.batch'
    });
  });

  it('plans declared migrations: covered breaking changes pass the R7 gate', () => {
    const v1 = { id: 'item', fields: { thickness: { base: 'quantity', unit: 'mm' }, note: { base: 'string' } } };
    // A field retype through an expression, covered by its step.
    const v2 = {
      ...v1,
      fields: { thickness: { base: 'number' }, note: v1.fields.note },
      migrate: [{ kind: 'retype-field', field: 'thickness', via: { op: 'var', name: 'value' } }]
    };
    const plan = planTypeMigration(v1, v2);
    expect(plan.covered).toBe(true);
    expect(plan.breaking.map(change => change.kind)).toEqual(['retype-field']);
    expect(() => requireCompatible(v1, v2)).not.toThrow();
  });

  it('a declared remove-edge step covers edge removal and resolves its execution context', () => {
    const v1 = {
      id: 'assembly', class: 'item',
      fields: { name: { base: 'string' } },
      edges: { children: { parts: { types: ['assembly', 'material'], lineageKey: 'assemblyId' } } }
    };
    const plan = planTypeMigration(v1, {
      id: 'assembly', class: 'item',
      fields: v1.fields,
      migrate: [{ kind: 'remove-edge', edge: 'children.parts' }]
    });
    expect(plan.covered).toBe(true);
    expect(plan.breaking.map(change => change.kind)).toEqual(['remove-edge']);
    // The step the executor receives carries the removed previous entry's
    // stored key and child types (SPEC §11).
    expect(plan.steps[0]).toEqual({
      kind: 'remove-edge', edge: 'children.parts', lineageKey: 'assemblyId', types: ['assembly', 'material']
    });
    expect(() => requireCompatible(v1, {
      id: 'assembly', class: 'item', fields: v1.fields,
      migrate: [{ kind: 'remove-edge', edge: 'children.parts' }]
    })).not.toThrow();
  });

  it('refuses uncovered breaking changes, stale steps, and unknown step kinds', () => {
    const v1 = { id: 'item', fields: { note: { base: 'string' } } };
    // A declared step matching nothing fails the gate instead of rotting.
    expect(planTypeMigration(v1, {
      ...v1, migrate: [{ kind: 'remove-field', field: 'note' }]
    }).errors).toEqual(['declared migration step remove-field note matches no breaking change']);
    // remove-edge without its declared step refuses; a stale remove-edge
    // step (no matching removal) fails like any stale step.
    const parent = { id: 'parent', edges: { children: { batch: { typeId: 'batch' } } } };
    expect(planTypeMigration(parent, { id: 'parent' }).errors)
      .toEqual(['remove-edge children.batch requires a remove-edge step']);
    expect(planTypeMigration({ id: 'parent' }, { id: 'parent', migrate: [{ kind: 'remove-edge', edge: 'children.batch' }] }).errors)
      .toEqual(['declared migration step remove-edge children.batch matches no breaking change']);
    // Malformed steps refuse normalization.
    expect(planTypeMigration(v1, { ...v1, migrate: [{ kind: 'nope' }] }).errors)
      .toEqual(['unknown migration step kind nope']);
    expect(() => requireCompatible(v1, { ...v1, fields: {} }))
      .toThrow(/without a covering declared migration/);
  });

  it('a rename-field step covers its remove/add pair when descriptors match', () => {
    const v1 = { id: 'item', fields: { note: { base: 'string' } } };
    const v2 = { id: 'item', fields: { label: { base: 'string' } }, migrate: [{ kind: 'rename-field', from: 'note', to: 'label' }] };
    const plan = planTypeMigration(v1, v2);
    expect(plan.covered).toBe(true);
    expect(plan.breaking.map(change => change.kind).sort()).toEqual(['add-required-field', 'remove-field']);
    // A required new field without a pairing rename needs add-default-field
    // (and the removed old field still needs its own step).
    expect(planTypeMigration(v1, { id: 'item', fields: { label: { base: 'string' } } }).errors)
      .toEqual([
        'remove-field note requires a remove-field or rename-field step',
        'add-required-field label requires an add-default-field step'
      ]);
    expect(planTypeMigration(v1, {
      id: 'item', fields: { note: v1.fields.note, label: { base: 'string' } },
      migrate: [{ kind: 'add-default-field', field: 'label', value: 'unnamed' }]
    }).covered).toBe(true);
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
    // Empty types have nothing to migrate: with an instance probe
    // reporting zero rows, the same breaking redefinition lands freely.
    const probed = createTypeRegistry({ id: 'spec-probed', hasInstances: () => 0 });
    probed.defineType(sheet);
    expect(() => probed.defineType({
      ...sheet, fields: { serial: sheet.fields.serial }
    })).not.toThrow();
  });

  it('redefining away from a never-compiling stored declaration is a free repair', () => {
    // Stored state only the historical persist-before-compile write order
    // could produce: a file class carrying children edges. Instances or
    // not, the diff must not protect it — there is no valid contract to
    // migrate away from.
    const registry = createTypeRegistry({ id: 'spec-repair', hasInstances: () => 7 });
    registry.defineType({
      id: 'yu', class: 'file', name: 'Yu', scope: 'org', organizationId: 'org-1',
      fields: { note: { base: 'string', identifier: true } },
      edges: { children: { parts: { types: ['missing-child'] } } }
    });
    const repaired = registry.defineType({
      id: 'yu', class: 'file', name: 'Yu', scope: 'org', organizationId: 'org-1',
      fields: { note: { base: 'string', identifier: true } }
    });
    expect(repaired.version).toBe(2);
    expect(repaired.edges).toEqual({});
    expect(registry.compile('org-1').errors).toEqual([]);

    // Healthy stored declarations with live instances still refuse.
    expect(() => registry.defineType({
      id: 'yu', class: 'file', name: 'Yu', scope: 'org', organizationId: 'org-1',
      fields: {}
    })).toThrow(/breaking change/);
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
  it('the CNC pack compiles clean', () => {
    const registry = packRegistry();
    const compiled = registry.compile();
    expect(compiled.errors).toEqual([]);
    expect([...compiled.types.keys()].sort()).toEqual([
      'cut-plan', 'facade', 'material', 'occs', 'organization', 'part', 'photo',
      'project', 'queue', 'sheet', 'solve-run', 'user'
    ]);
  });
});

describe('payload traits (SPEC §4)', () => {
  it('normalizes MIME strings and objects to the canonical trait shape', () => {
    expect(normalizeType({ id: 'legacy-doc', class: 'file', payload: 'application/x-legacy' }).payload)
      .toEqual({ mime: ['application/x-legacy'], creation: ['upload'] });
    expect(normalizeType({ id: 'traits-doc', class: 'file', payload: { mime: ['image/png', 'image/jpeg'], maxSize: 1024, preview: 'attachment' } }).payload)
      .toEqual({ mime: ['image/png', 'image/jpeg'], maxSize: 1024, preview: 'attachment', creation: ['upload'] });
    expect(() => normalizeType({ id: 'empty-doc', class: 'file', payload: { mime: [] } })).toThrow(/at least one accepted MIME/);
    expect(normalizeType({
      id: 'bare-doc',
      class: 'item',
      fields: { serial: { base: 'string' } }
    }).payload).toBeNull();
    expect(normalizeType({
      id: 'bare-doc',
      class: 'item',
      fields: { serial: { base: 'string' } }
    }).access).toBeUndefined();
  });

  it('round-trips the write-gate delegation facet through defineType/normalizeType', () => {
    expect(normalizeType({
      id: 'linked-doc',
      class: 'item',
      fields: { name: { base: 'string' } },
      access: { inherits: 'panel' }
    }).access).toEqual({ inherits: 'panel' });
    expect(() => normalizeType({
      id: 'linked-doc',
      class: 'item',
      fields: { name: { base: 'string' } },
      access: {}
    })).toThrow(/access\.inherits/);
  });

  it('normalizes and validates the creation protocol list', () => {
    expect(normalizeType({ id: 'photo-doc', class: 'file', payload: { mime: ['image/*'], creation: ['upload', 'capture'] } }).payload.creation)
      .toEqual(['upload', 'capture']);
    expect(normalizeType({ id: 'note-doc', class: 'file', payload: { mime: ['application/json'], creation: 'editor' } }).payload.creation)
      .toEqual(['editor']);
    expect(() => normalizeType({ id: 'bad-doc', class: 'file', payload: { mime: ['text/plain'], creation: ['telepathy'] } }))
      .toThrow(/creation protocol telepathy/);
    expect(() => normalizeType({ id: 'none-doc', class: 'file', payload: { mime: ['text/plain'], creation: [] } }))
      .toThrow(/at least one creation protocol/);
  });

  it('accepts files strictly: explicit mime match plus the declared byte limit', () => {
    const traits = { mime: ['image/*', 'application/pdf'], maxSize: 2048 };
    expect(payloadAccepts(traits, { mime: 'image/png', size: 1024 })).toBe(true);
    expect(payloadAccepts(traits, { mime: 'image/png', size: 4096 })).toBe(false);
    expect(payloadAccepts(traits, { mime: 'text/plain' })).toBe(false);
    expect(payloadAccepts(traits, { mime: null })).toBe(false);
    expect(payloadAccepts(null, { mime: 'image/png' })).toBe(false);
    // Raw single-string mime declarations (pack boundary shape) match too.
    expect(payloadAccepts({ mime: 'application/dxf' }, { mime: 'application/dxf' })).toBe(true);
  });
});

describe('display policy (SPEC §4/§7)', () => {
  it('derives name/glyph/identifier/sections into the client bundle', () => {
    const registry = createTypeRegistry({ id: 'render-spec' });
    registry.defineType({
      id: 'widget', class: 'item',
      name: 'Widget',
      glyph: 'pi pi-star',
      fields: {
        name: { base: 'string', identifier: true },
        size: { base: 'quantity', unit: 'mm' },
        photo: { base: 'blob', nullable: true, depiction: true },
        owner: { base: 'ref', accepts: ['user'] },
        notes: { base: 'string', max: 400, nullable: true }
      }
    });
    const record = compileClientBundle(registry).types.find(type => type.id === 'widget');
    expect(record.render).toBeUndefined();
    expect(record.name).toBe('Widget');
    expect(record.glyph).toBe('pi pi-star');
    expect(record.identifier).toBe('name');
    expect(record.depiction).toEqual({ glyph: 'pi pi-star', thumb: 'photo' });
    // Sections derive from the row: declared order within, fixed section
    // order, only non-empty sections emitted.
    expect(record.sections).toEqual([
      { id: 'summary', label: null, fields: ['name'] },
      { id: 'dimensions', label: null, fields: ['size'] },
      { id: 'media', label: null, fields: ['photo'] },
      { id: 'relations', label: null, fields: ['owner'] },
      { id: 'notes', label: null, fields: ['notes'] }
    ]);
    // State display is not type-derived (SPEC §7): the bundle carries no
    // state vocabulary — compiled process contracts own it.
    expect(record.states).toBeUndefined();
  });

  it('assigns list/map fields by their item base and defaults the glyph by class', () => {
    const registry = createTypeRegistry({ id: 'render-sections-spec' });
    registry.defineType({
      id: 'gadget', class: 'file',
      fields: {
        title: { base: 'string', identifier: true },
        widths: { base: 'list', itemType: { base: 'quantity', unit: 'mm' } },
        parts: { base: 'list', itemType: { base: 'ref', accepts: ['user'] } },
        tags: { base: 'list', itemType: { base: 'string' } },
        specs: { base: 'map', itemType: { base: 'blob' }, nullable: true }
      }
    });
    const record = compileClientBundle(registry).types[0];
    expect(record.glyph).toBe('pi pi-file');
    expect(record.sections).toEqual([
      { id: 'summary', label: null, fields: ['title', 'tags'] },
      { id: 'dimensions', label: null, fields: ['widths'] },
      { id: 'media', label: null, fields: ['specs'] },
      { id: 'relations', label: null, fields: ['parts'] }
    ]);
    // The authored flag names the record; nothing is minted for an
    // unflagged type.
    expect(record.identifier).toBe('title');
    expect(record.depiction.thumb).toBeNull();
  });

  it('serves an identifier-less declaration with the identifier law reported', () => {
    const registry = createTypeRegistry({ id: 'render-spec-bare' });
    registry.defineType({
      id: 'bare', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { serial: { base: 'string' } }
    });
    const record = compileClientBundle(registry, 'org-1').types[0];
    expect(record.name).toBeNull();
    // Served, not ejected: the unflagged declaration keeps its view, the
    // bundle carries no identifier (records render the unnamed
    // placeholder), and both display laws report through the compile
    // channel (write gate + designer diagnostics).
    expect(record.identifier).toBeNull();
    expect(registry.compile('org-1').errors).toEqual([
      'type bare: exactly one field must carry the identifier flag (flagged: none)',
      'type bare: name is required'
    ]);
  });

  it('adopts legacy render keys at the boundary and deletes them', () => {
    const legacy = normalizeType({
      id: 'legacy-widget', class: 'item',
      fields: { name: { base: 'string' }, color: { base: 'string', render: { control: 'ColorPicker' } } },
      render: {
        label: 'Legacy Widget',
        icon: 'pi pi-box',
        identityField: 'name',
        groups: [{ id: 'core', fields: ['name'] }],
        listLayout: 'timeline',
        sortKey: 'name'
      }
    });
    expect(legacy.render).toBeUndefined();
    expect(legacy.name).toBe('Legacy Widget');
    expect(legacy.glyph).toBe('pi pi-box');
    expect(legacy.fields.name.identifier).toBe(true);
    expect(legacy.fields.color.control).toBe('ColorPicker');
    expect(legacy.fields.color.render).toBeUndefined();
    expect(legacy.states).toBeUndefined();
    // System declarations without any carrier adopt startCase(id) once.
    expect(normalizeType({ id: 'engineer-thing', class: 'file', fields: {} }).name).toBe('Engineer Thing');
  });

  it('keeps a normalized preview declaration across a recompile', () => {
    const declared = normalizeType({
      id: 'previewed-widget', class: 'file', fields: { name: { base: 'string' } },
      render: { groups: [{ id: 'geometry', fields: [{ path: 'fields.geometry.preview', role: 'previewSource', display: 'geometry' }] }] }
    });
    expect(declared.previewSource).toEqual({ path: 'fields.geometry.preview', display: 'geometry' });
    expect(normalizeType(declared).previewSource).toEqual(declared.previewSource);
  });

  it('enforces the display-flag laws at compile', () => {
    const registry = createTypeRegistry({ id: 'render-flag-spec' });
    registry.defineType({
      id: 'two-ids', class: 'item', name: 'Two ids',
      fields: {
        name: { base: 'string', identifier: true },
        serial: { base: 'string', identifier: true }
      }
    });
    expect(registry.compile().errors).toContainEqual(
      'type two-ids: exactly one field must carry the identifier flag (flagged: name, serial)'
    );
    const registry2 = createTypeRegistry({ id: 'render-flag-spec-2' });
    registry2.defineType({
      id: 'two-pics', class: 'file', name: 'Two pics',
      fields: {
        front: { base: 'blob', depiction: true },
        back: { base: 'blob', depiction: true }
      }
    });
    expect(registry2.compile().errors).toContainEqual(
      'type two-pics: depiction flag on multiple fields (front, back) — at most one'
    );
    // Zero flags is the same deviation as two, at every scope: the view
    // stays served with no identifier and the compile channel reports.
    const registry3 = createTypeRegistry({ id: 'render-flag-spec-3' });
    registry3.defineType({
      id: 'no-name-field', class: 'item', name: 'No name field',
      fields: { area: { base: 'quantity', unit: 'm2' } }
    });
    expect(registry3.compile().errors).toEqual([
      'type no-name-field: exactly one field must carry the identifier flag (flagged: none)'
    ]);
    const unflagged = compileClientBundle(registry3).types.find(record => record.id === 'no-name-field');
    expect(unflagged.identifier).toBeNull();
    expect(unflagged.fields.name).toBeUndefined();
    const registry4 = createTypeRegistry({ id: 'render-flag-spec-4' });
    registry4.defineType({
      id: 'org-instant-only', class: 'item', name: 'Instant Only', scope: 'org', organizationId: 'org-1',
      fields: { anythin: { base: 'instant', label: 'Anythin' } }
    });
    const orgView = registry4.compile('org-1');
    expect(orgView.errors).toEqual([
      'type org-instant-only: exactly one field must carry the identifier flag (flagged: none)'
    ]);
    const served = compileClientBundle(registry4, 'org-1').types
      .find(record => record.id === 'org-instant-only');
    expect(served.identifier).toBeNull();
  });

  it('requires a name on every type at compile', () => {
    const registry = createTypeRegistry({ id: 'name-law-spec' });
    registry.defineType({
      id: 'nameless', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { serial: { base: 'string', identifier: true } }
    });
    // Served, not ejected — but the missing name reports through the
    // standard compile channel (write gate + designer diagnostics).
    expect(registry.compile('org-1').errors).toEqual(['type nameless: name is required']);
    const named = registry.defineType({
      id: 'nameless', class: 'item', name: 'Nameless', scope: 'org', organizationId: 'org-1',
      fields: { serial: { base: 'string', identifier: true } }
    });
    expect(named.name).toBe('Nameless');
    expect(registry.compile('org-1').errors).toEqual([]);
  });

  it('compiles stored records that carry a mint-era identifier row', () => {
    // Stored docs normalized before the authored-identifier law carry a
    // flagged `name` row (`writable`/`constructible` false); they keep
    // compiling clean, and carrying the row through a redefinition that
    // adds a nullable field is minor (SPEC §11).
    const registry = createTypeRegistry({ id: 'mint-redefine-spec', hasInstances: () => 5 });
    registry.defineType({
      id: 'gauge', class: 'item', name: 'Gauge', scope: 'org', organizationId: 'org-1',
      fields: { pressure: { base: 'quantity', unit: 'm2' } }
    });
    expect(registry.compile('org-1').errors).toEqual([
      'type gauge: exactly one field must carry the identifier flag (flagged: none)'
    ]);
    const redefined = registry.defineType({
      id: 'gauge', class: 'item', name: 'Gauge', scope: 'org', organizationId: 'org-1',
      fields: {
        pressure: { base: 'quantity', unit: 'm2' },
        name: { base: 'string', nullable: true, identifier: true, writable: false, constructible: false },
        note: { base: 'string', nullable: true }
      }
    });
    expect(redefined.version).toBe(2);
    expect(redefined.fields.name).toMatchObject({ identifier: true });
    expect(registry.compile('org-1').errors).toEqual([]);
  });
});
