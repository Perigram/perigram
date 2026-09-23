import { describe, it, expect } from 'vitest';
import {
  quantity, convert, unify,
  rowToSchema, checkFields,
  createTypeRegistry, validateInstance, schemaFor, normalizeType,
  diffTypes, requireCompatible, normalizeMigrateSteps, planTypeMigration,
  evaluate, checkMatch,
  normalizeOperator,
  renderPolicyFor, compileClientBundle,
  cncTypePack, partyTypes, nestingOperators, packFixtures,
  classMayDeclareChildren, lineageKeyForParent,
  declarationsFromCtsRecords, mergeTransitionNodeStates,
  declarationWorkflow
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
  it('enforces presets', () => {
    const registry = packRegistry();
    registry.defineType({ id: 'bad-item', class: 'item', fields: { note: { base: 'string' } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-item: item requires states/));
    // Items carry individuality through their lifecycle and data, not a
    // mandated serial/specs field: the content mandate is gone (SPEC §5).
    expect(() => registry.defineType({
      id: 'bare-item', class: 'item', scope: 'system',
      fields: { name: { base: 'string' } },
      states: { main: { initial: 'new', values: ['new', 'done'] } }
    })).not.toThrow();
    registry.defineType({ id: 'bad-file', class: 'file', edges: { children: { c: { types: ['material'] } } } });
    expect(registry.compile().errors).toContainEqual(expect.stringMatching(/bad-file: file may not declare lineage children/));
    registry.defineType({ id: 'bad-party', class: 'party', scope: 'org', organizationId: 'org-1', fields: {} });
    expect(registry.compile('org-1').errors).toContainEqual(expect.stringMatching(/party types are framework-only/));
  });

  it('exposes the containment predicate the authoring surfaces gate on', () => {
    expect(classMayDeclareChildren('file')).toBe(false);
    expect(classMayDeclareChildren('party')).toBe(false);
    expect(classMayDeclareChildren('item')).toBe(true);
    expect(classMayDeclareChildren('group')).toBe(true);
    expect(classMayDeclareChildren('process')).toBe(true);
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
      states: { main: { initial: 'draft', values: ['draft', 'done', 'dead'], terminal: ['done'] } },
      transitions: [
        { from: 'draft', to: 'done', intent: 'go' },
        { from: 'draft', to: 'dead', intent: 'go' }
      ]
    })).toThrow(/one intent has one target/);
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

describe('transition-node statuses (SPEC §7/§20 merge)', () => {
  it('fans declared edges from every other value; terminals derive over the merged set', () => {
    const merged = mergeTransitionNodeStates({
      values: ['GOO'],
      transitions: [],
      targets: [{ value: 'CHANGED', terminal: true }]
    });
    expect(merged).toEqual({
      values: ['GOO', 'CHANGED'],
      transitions: [{ from: 'GOO', to: 'CHANGED' }],
      terminal: ['CHANGED']
    });
  });

  it('dedupes wire edges the fan-out repeats and drops off-values', () => {
    const merged = mergeTransitionNodeStates({
      values: ['a', 'b', 'c'],
      transitions: [{ from: 'a', to: 'b', intent: 'go' }, { from: 'a', to: 'ghost' }],
      targets: [{ value: 'b', intent: 'go' }]
    });
    expect(merged.transitions).toEqual([
      { from: 'a', to: 'b', intent: 'go' },
      { from: 'c', to: 'b', intent: 'go' }
    ]);
    // a and c carry outgoing edges; only b sinks.
    expect(merged.terminal).toEqual(['b']);
  });

  it('declarationsFromCtsRecords merges persisted transition-node targets', () => {
    const records = {
      cls: { id: 'cls', kind: 'class', typeId: 't-goo-1', class: 'file' },
      goo: { id: 'goo', kind: 'state', typeId: 't-goo-1', value: 'GOO', initial: true, terminal: false },
      changed: { id: 'changed', kind: 'state', typeId: 't-goo-1', value: 'CHANGED', initial: false, terminal: false }
    };
    const processNodes = {
      move: { id: 'move', kind: 'cts.transition', typeId: 't-goo-1', state: { to: 'CHANGED' } }
    };
    const [declaration] = declarationsFromCtsRecords(records, processNodes);
    expect(declaration.states.main).toEqual({
      initial: 'GOO',
      values: ['GOO', 'CHANGED'],
      terminal: ['CHANGED']
    });
    expect(declaration.transitions).toEqual([{ from: 'GOO', to: 'CHANGED' }]);
    // The merged declaration satisfies R4 as a whole: the target is
    // reachable and the terminal derives from the merged edge set.
    const registry = createTypeRegistry({ id: 'merge-check' });
    registry.defineType({ ...declaration, fields: { name: { base: 'string' } } });
    expect(registry.compile().errors).toEqual([]);
  });

  it('declarationWorkflow derives the v2 machine a producer lifecycle and the status engine share', () => {
    const type = normalizeType({
      id: 't-goo-2', class: 'file', scope: 'org', organizationId: 'org-1',
      fields: { name: { base: 'string' } },
      states: { main: { initial: 'GOO', values: ['GOO', 'CHANGED'], terminal: ['CHANGED'] } },
      transitions: [{ from: 'GOO', to: 'CHANGED', intent: 'change' }]
    });
    const workflow = declarationWorkflow(type);
    expect(workflow.primaryRegion).toBe('main');
    expect(workflow.regions.main.initial).toBe('GOO');
    expect(workflow.regions.main.states.CHANGED.isTerminal).toBe(true);
    expect(workflow.regions.main.states.GOO.canUpdateMeta).toBe(true);
    expect(workflow.regions.main.transitions).toEqual([
      { from: 'GOO', to: 'CHANGED', intent: 'change' }
    ]);
    expect(declarationWorkflow(normalizeType({
      id: 't-plain', class: 'file', fields: { name: { base: 'string' } } }
    ))).toBeNull();
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

  it('added state values and children edges are minor; removals are breaking', () => {
    const v1 = {
      id: 'item',
      fields: { name: { base: 'string' } },
      states: { main: { values: ['draft', 'done'] } },
      edges: { children: { batch: { typeId: 'batch' } } }
    };
    const additive = diffTypes(v1, {
      ...v1,
      states: { main: { values: ['draft', 'done', 'archived'] } },
      edges: { children: { batch: { typeId: 'batch' }, kit: { typeId: 'kit' } } }
    });
    expect(additive.breaking).toBe(false);
    expect(additive.changes).toEqual([
      { severity: 'minor', kind: 'add-state', state: 'archived' },
      { severity: 'minor', kind: 'add-edge', edge: 'children.kit' }
    ]);
    const removedState = diffTypes(v1, { ...v1, states: { main: { values: ['draft'] } } });
    expect(removedState.changes).toContainEqual({ severity: 'breaking', kind: 'remove-state', state: 'done' });
  });

  it('reports a rename as its remove/add pair — rename intent is never inferred', () => {
    const v1 = { id: 'item', states: { main: { values: ['scrap', 'ready'] } } };
    const diff = diffTypes(v1, { ...v1, states: { main: { values: ['recycled', 'ready'] } } });
    expect(diff.breaking).toBe(true);
    expect(diff.changes).toEqual([
      { severity: 'breaking', kind: 'remove-state', state: 'scrap' },
      { severity: 'minor', kind: 'add-state', state: 'recycled' }
    ]);
  });

  it('plans declared migrations: covered breaking changes pass the R7 gate', () => {
    const v1 = {
      id: 'item',
      fields: { thickness: { base: 'quantity', unit: 'mm' }, note: { base: 'string' } },
      states: { main: { values: ['scrap', 'ready'] } }
    };
    // scrap -> recycled rename plus a field retype through an expression.
    const v2 = {
      ...v1,
      fields: { thickness: { base: 'number' }, note: v1.fields.note },
      states: { main: { values: ['recycled', 'ready'] } },
      migrate: [
        { kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' },
        { kind: 'retype-field', field: 'thickness', via: { op: 'var', name: 'value' } }
      ]
    };
    const plan = planTypeMigration(v1, v2);
    expect(plan.covered).toBe(true);
    expect(plan.breaking.map(change => change.kind).sort()).toEqual(['remove-state', 'retype-field']);
    expect(() => requireCompatible(v1, v2)).not.toThrow();
  });

  it('refuses uncovered breaking changes, stale steps, and unknown targets', () => {
    const v1 = { id: 'item', fields: { note: { base: 'string' } }, states: { main: { values: ['scrap'] } } };
    // No steps at all: uncovered.
    expect(planTypeMigration(v1, { ...v1, states: { main: { values: [] } } }).errors)
      .toEqual(['remove-state scrap requires a rename-enum-value step']);
    // Step target not in the next enum.
    expect(planTypeMigration(v1, {
      ...v1, states: { main: { values: ['ready'] } },
      migrate: [{ kind: 'rename-enum-value', from: 'scrap', to: 'missing' }]
    }).errors).toEqual(['rename-enum-value target missing is not a state of the next declaration']);
    // A declared step matching nothing fails the gate instead of rotting.
    expect(planTypeMigration(v1, {
      ...v1, migrate: [{ kind: 'remove-field', field: 'note' }]
    }).errors).toEqual(['declared migration step remove-field note matches no breaking change']);
    // remove-edge is coverable by nothing.
    const parent = { id: 'parent', edges: { children: { batch: { typeId: 'batch' } } } };
    expect(planTypeMigration(parent, { id: 'parent' }).errors)
      .toEqual(['remove-edge children.batch is not coverable by any declared migration step']);
    // Malformed steps refuse normalization.
    expect(planTypeMigration(v1, { ...v1, migrate: [{ kind: 'nope' }] }).errors)
      .toEqual(['unknown migration step kind nope']);
    expect(() => requireCompatible(v1, { ...v1, states: { main: { values: [] } } })).toThrow(/without a covering declared migration/);
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
      id: 'yu', class: 'file', scope: 'org', organizationId: 'org-1',
      fields: { note: { base: 'string' } },
      edges: { children: { parts: { types: ['missing-child'] } } }
    });
    const repaired = registry.defineType({
      id: 'yu', class: 'file', scope: 'org', organizationId: 'org-1',
      fields: { note: { base: 'string' } }
    });
    expect(repaired.version).toBe(2);
    expect(repaired.edges).toEqual({});
    expect(registry.compile('org-1').errors).toEqual([]);

    // Healthy stored declarations with live instances still refuse.
    expect(() => registry.defineType({
      id: 'yu', class: 'file', scope: 'org', organizationId: 'org-1',
      fields: {}
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

describe('payload traits (SPEC §4)', () => {
  it('normalizes MIME strings and objects to the canonical trait shape', () => {
    expect(normalizeType({ id: 'legacy-doc', class: 'file', payload: 'application/x-legacy' }).payload)
      .toEqual({ mime: ['application/x-legacy'], creation: ['upload'] });
    expect(normalizeType({ id: 'traits-doc', class: 'file', payload: { mime: ['image/png', 'image/jpeg'], maxSize: 1024, preview: 'attachment' } }).payload)
      .toEqual({ mime: ['image/png', 'image/jpeg'], maxSize: 1024, preview: 'attachment', creation: ['upload'] });
    expect(() => normalizeType({ id: 'empty-doc', class: 'file', payload: { mime: [] } })).toThrow(/at least one accepted MIME/);
    expect(normalizeType({ id: 'bare-doc', class: 'item', states: { main: { initial: 'new', values: ['new'] } }, fields: { serial: { base: 'string' } } }).payload).toBeNull();
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
      },
      states: { main: { initial: 'draft', values: ['draft', 'done'], terminal: ['done'] } }
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
    // Per-state display policy resolves on the axis: authored label,
    // terminal default severity, startCase label default.
    expect(record.states.main.render).toEqual({
      draft: { label: 'Draft', icon: null, severity: 'info' },
      done: { label: 'Done', icon: null, severity: 'secondary' }
    });
  });

  it('assigns list/map fields by their item base and defaults the glyph by class', () => {
    const registry = createTypeRegistry({ id: 'render-sections-spec' });
    registry.defineType({
      id: 'gadget', class: 'file',
      fields: {
        title: { base: 'string' },
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
    // No explicit flag: the first declared string field is minted as the
    // identifier at the boundary (frozen; explicit flags deviate).
    expect(record.identifier).toBe('title');
    expect(record.depiction.thumb).toBeNull();
  });

  it('serves name: null as "Unnamed" for org declarations without a carrier', () => {
    const registry = createTypeRegistry({ id: 'render-spec-bare' });
    registry.defineType({
      id: 'bare', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { serial: { base: 'string' } },
      states: { main: { initial: 'new', values: ['new'] } }
    });
    const record = compileClientBundle(registry, 'org-1').types[0];
    expect(record.name).toBeNull();
    // The unnamed placeholder means "identifier value is null" and nothing
    // else — the identifier itself was adopted (first string field).
    expect(record.identifier).toBe('serial');
    expect(registry.compile('org-1').errors).toEqual([]);
  });

  it('adopts legacy render keys at the boundary and deletes them', () => {
    const legacy = normalizeType({
      id: 'legacy-widget', class: 'item',
      fields: { name: { base: 'string' }, color: { base: 'string', render: { control: 'ColorPicker' } } },
      states: { main: { initial: 'draft', values: ['draft', 'done'], terminal: ['done'] } },
      render: {
        label: 'Legacy Widget',
        icon: 'pi pi-box',
        identityField: 'name',
        states: { done: { severity: 'success' } },
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
    expect(legacy.states.main.render).toEqual({ done: { severity: 'success' } });
    // System declarations without any carrier adopt startCase(id) once.
    expect(normalizeType({ id: 'engineer-thing', class: 'file', fields: {} }).name).toBe('Engineer Thing');
  });

  it('enforces the display-flag laws at compile', () => {
    const registry = createTypeRegistry({ id: 'render-flag-spec' });
    registry.defineType({
      id: 'two-ids', class: 'item', name: 'Two ids',
      fields: {
        name: { base: 'string', identifier: true },
        serial: { base: 'string', identifier: true }
      },
      states: { main: { initial: 'new', values: ['new'] } }
    });
    expect(registry.compile().errors).toContainEqual(
      'type two-ids: identifier flag on multiple fields (name, serial) — exactly one required'
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
    // No string field to adopt and no explicit flag: SYSTEM types get the
    // compile error (the data is ours to fix).
    const registry3 = createTypeRegistry({ id: 'render-flag-spec-3' });
    registry3.defineType({
      id: 'no-name-field', class: 'item', name: 'No name field',
      fields: { area: { base: 'quantity', unit: 'm2' } },
      states: { main: { initial: 'new', values: ['new'] } }
    });
    expect(registry3.compile().errors).toContainEqual(
      'type no-name-field: mark the field that names its records (identifier flag on exactly one field)'
    );
    // ORG types with nothing to mint from stay compiled and served — the
    // missing identifier is an authoring prompt (records render the
    // unnamed placeholder), never a view-fatal error that would eject the
    // type and cascade "unknown type" through every bound process node.
    const registry4 = createTypeRegistry({ id: 'render-flag-spec-4' });
    registry4.defineType({
      id: 'org-instant-only', class: 'item', scope: 'org', organizationId: 'org-1',
      fields: { anythin: { base: 'instant', label: 'Anythin' } },
      states: { main: { initial: 'GOO', values: ['GOO', 'CHANGED'], terminal: ['CHANGED'] } },
      transitions: [{ from: 'GOO', to: 'CHANGED' }]
    });
    const orgView = registry4.compile('org-1');
    expect(orgView.errors).toEqual([]);
    const served = compileClientBundle(registry4, 'org-1').types
      .find(record => record.id === 'org-instant-only');
    expect(served.identifier).toBeNull();
  });
});
