import { describe, it, expect } from 'vitest';
import { ctsFieldToProcessType, ctsFieldToLegacyType, ctsFieldToConstructionInput, legacyTypeToConstructionInput, CTS_UNIT_TO_LEGACY } from './process-grammar.js';
import { checkDeclarationsAgainstCts } from './process-checks.js';
import { createTypeRegistry } from './index.js';
import { cncTypePack } from './pack/cnc.js';
import { frameworkTypes } from './pack/framework.js';

function registryWithOrgType() {
  const registry = createTypeRegistry({ id: 'seam' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  registry.defineType({
    id: 'widget', class: 'file', scope: 'org', organizationId: 'org-1',
    fields: { name: { base: 'string' }, stage: { base: 'enum', values: ['raw', 'done'] } }
  });
  return registry;
}

// The draft's own state records are the state vocabulary (SPEC §7).
function draftStateRecords() {
  return {
    s1: { id: 's1', kind: 'state', typeId: 'widget', value: 'raw' },
    s2: { id: 's2', kind: 'state', typeId: 'widget', value: 'done' }
  };
}

describe('grammar adapter (CTS <-> PROCESS_BASE_TYPES)', () => {
  it('maps the declaration subset onto process types', () => {
    const cases = [
      [{ base: 'string' }, { base: 'string' }],
      [{ base: 'quantity', unit: 'mm' }, { base: 'number', unit: 'mm' }],
      [{ base: 'quantity', unit: 'min' }, { base: 'number', unit: 'minute' }],
      [{ base: 'quantity', unit: 'deg' }, { base: 'number', unit: 'degree' }],
      [{ base: 'instant' }, { base: 'dateTime' }],
      [{ base: 'ref', accepts: ['queue'] }, { base: 'entityRef', typeId: 'queue' }],
      [{ base: 'ref', accepts: ['occs', 'cut-plan'] }, { base: 'entityRef', accepts: ['occs', 'cut-plan'] }],
      [{ base: 'list', itemType: { base: 'number' } }, { base: 'array', itemType: { base: 'number' } }],
      [{ base: 'map', itemType: { base: 'string' } }, { base: 'map', keyType: { base: 'string' }, valueType: { base: 'string' } }],
      [{ base: 'blob' }, { base: 'attachmentRef' }],
      [{ base: 'json', kind: 'document.report' }, { base: 'json', kind: 'document.report' }]
    ];
    for (const [ctsDescriptor, expectedProcess] of cases) {
      expect(ctsFieldToProcessType(ctsDescriptor)).toEqual(expectedProcess);
    }
  });

  it('reports bases with no process counterpart as lossy json', () => {
    expect(ctsFieldToProcessType({ base: 'variant', tags: ['a'] }).lossy).toBeTruthy();
  });

  it('translates descriptors onto legacy field-schema types through one unit-spelling table', () => {
    expect(CTS_UNIT_TO_LEGACY).toMatchObject({ min: 'minute', deg: 'degree', mm: 'mm', currency: 'currency' });
    expect(ctsFieldToLegacyType({ base: 'quantity', unit: 'min', nullable: true }))
      .toEqual({ base: 'number', shape: 'item', nullable: true, unit: 'minute' });
    expect(ctsFieldToLegacyType({ base: 'quantity', unit: 'deg' }))
      .toEqual({ base: 'number', shape: 'item', nullable: false, unit: 'degree' });
    expect(ctsFieldToLegacyType({ base: 'ref', accepts: ['queue'] }))
      .toEqual({ base: 'entityRef', shape: 'item', nullable: false, typeId: 'queue' });
    expect(ctsFieldToLegacyType({ base: 'list', itemType: { base: 'string' } }))
      .toEqual({ base: 'array', shape: 'item', nullable: false, itemType: { base: 'string', shape: 'item', nullable: false } });
  });

  it('derives construction input kinds from descriptors and legacy types at one seam', () => {
    expect(ctsFieldToConstructionInput({ base: 'ref', accepts: ['queue'] })).toEqual({ type: 'entity', typeId: 'queue' });
    expect(ctsFieldToConstructionInput({ base: 'ref', accepts: ['a', 'b'] })).toEqual({ type: 'entity', accepts: ['a', 'b'] });
    expect(ctsFieldToConstructionInput({ base: 'list', itemType: { base: 'ref', accepts: ['queue'] } }))
      .toEqual({ type: 'typeList', typeId: 'queue' });
    expect(ctsFieldToConstructionInput({ base: 'quantity', unit: 'mm' })).toEqual({ type: 'number' });
    expect(ctsFieldToConstructionInput({ base: 'instant' })).toEqual({ type: 'date' });
    expect(ctsFieldToConstructionInput({ base: 'blob' })).toEqual({ type: 'file' });
    expect(ctsFieldToConstructionInput({ base: 'record' })).toEqual({ type: 'object' });
    expect(legacyTypeToConstructionInput({ base: 'entityRef', typeId: 'queue' })).toEqual({ type: 'entity', typeId: 'queue' });
    expect(legacyTypeToConstructionInput({ base: 'array', itemType: { base: 'entityRef', typeId: 'queue' } }))
      .toEqual({ type: 'typeList', typeId: 'queue' });
    expect(legacyTypeToConstructionInput({ base: 'number', unit: 'minute' })).toEqual({ type: 'number', unit: 'minute' });
    expect(legacyTypeToConstructionInput({ base: 'dateTime' })).toEqual({ type: 'dateTime' });
  });
});

describe('declaration-check phase', () => {
  it('accepts references the registry resolves', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        producerOutputs: { out1: { typeId: 'queue' } },
        sockets: { s1: { type: { base: 'entityRef', typeId: 'widget' } } }
      }
    }, registry, 'org-1');
    expect(errors).toEqual([]);
  });

  it('rejects unknown entity types across record collections', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        producerOutputs: { out1: { typeId: 'nope' } },
        sockets: { s1: { type: { base: 'entityRef', typeId: 'ghost' } } }
      }
    }, registry, 'org-1');
    expect(errors).toContain('Producer output out1 references unknown type nope');
    expect(errors).toContain('Socket s1 references unknown type ghost');
  });

  it('rejects state values outside the draft state records and fields outside real rows', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        ctsTypes: draftStateRecords(),
        producerOutputs: { w: { typeId: 'widget' }, q: { typeId: 'queue' } },
        processNodes: {
          bad: { kind: 'cts.transition', typeId: 'widget', state: { to: 'FLYING' } },
          good: { kind: 'cts.transition', typeId: 'widget', state: { to: 'done' } },
          defaulted: { kind: 'cts.construct', typeId: 'widget', inputDefaults: { state: 'raw' } },
          n1: { kind: 'record.getField', typeId: 'widget', field: 'name' },
          n2: { kind: 'record.getField', typeId: 'widget', field: 'rogue' },
          n3: { kind: 'record.getField', typeId: 'queue', field: 'job' },
          n4: { kind: 'record.getField', typeId: 'queue', field: 'rogue' },
          n5: { kind: 'record.getField', typeId: 'queue', field: 'legacyData.name' }
        }
      }
    }, registry, 'org-1');
    expect(errors).toContainEqual(expect.stringMatching(/moves widget to undeclared state FLYING/));
    expect(errors).not.toContainEqual(expect.stringMatching(/moves widget to undeclared state done/));
    expect(errors).not.toContainEqual(expect.stringMatching(/moves widget to undeclared state raw/));
    expect(errors).toContainEqual(expect.stringMatching(/uses field rogue outside the widget row/));
    // queue rows are declared: the job root resolves, unknown roots fail,
    // and the retired block-prefixed spelling refuses instead of resolving
    expect(errors).not.toContainEqual(expect.stringMatching(/uses field job/));
    expect(errors).toContainEqual(expect.stringMatching(/uses field rogue outside the queue row/));
    expect(errors).toContainEqual(expect.stringMatching(/uses field legacyData.name outside the queue row/));
  });

  it('checks transition guards: boolean vocabulary only, row-relative paths under value', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        ctsTypes: draftStateRecords(),
        processNodes: {
          guarded: {
            kind: 'cts.transition', typeId: 'widget', state: { to: 'done' },
            guard: {
              op: 'and',
              args: [
                { op: 'lt', args: [{ op: 'field', path: ['value', 'name'] }, { op: 'lit', value: 'zz' }] },
                { op: 'not', arg: { op: 'eq', args: [{ op: 'field', path: ['value', 'stage'] }, { op: 'lit', value: 'raw' }] } }
              ]
            }
          },
          offRow: {
            kind: 'cts.transition', typeId: 'widget', state: { to: 'done' },
            guard: { op: 'gt', args: [{ op: 'field', path: ['value', 'ghost'] }, { op: 'lit', value: 1 }] }
          },
          unrooted: {
            kind: 'cts.transition', typeId: 'widget', state: { to: 'done' },
            guard: { op: 'gt', args: [{ op: 'field', path: ['name'] }, { op: 'lit', value: 1 }] }
          },
          comprehension: {
            kind: 'cts.transition', typeId: 'widget', state: { to: 'done' },
            guard: { op: 'map', list: { op: 'field', path: ['value', 'name'] }, var: 'x', body: { op: 'var', name: 'x' } }
          }
        }
      }
    }, registry, 'org-1');
    // The well-formed guard over declared row fields passes.
    expect(errors).not.toContainEqual(expect.stringMatching(/guarded guard/));
    expect(errors).not.toContainEqual(expect.stringMatching(/comprehension guard: field/));
    expect(errors).toContainEqual(expect.stringMatching(/offRow guard: field ghost outside the row/));
    expect(errors).toContainEqual(expect.stringMatching(/unrooted guard: field path must start at 'value'/));
    expect(errors).toContainEqual(expect.stringMatching(/comprehension guard: op map is not boolean vocabulary/));
  });


  it('checks operation field policies: row-checked lists, array shape', () => {
    const registry = registryWithOrgType();
    const nodes = {
      good: { id: 'good', kind: 'cts.transition', typeId: 'widget', state: { to: 'held' }, fieldPolicy: { visible: ['name', 'stage'], editable: ['stage'] } },
      offRow: { id: 'offRow', kind: 'cts.transition', typeId: 'widget', state: { to: 'held2' }, fieldPolicy: { visible: ['ghost'] } },
      stringy: { id: 'stringy', kind: 'cts.construct', typeId: 'widget', inputDefaults: { state: 'held3' }, fieldPolicy: { editable: 'name' } },
      cross: { id: 'cross', kind: 'cts.transition', typeId: 'widget', state: { to: 'held4' }, fieldPolicy: { visible: ['name'], editable: ['stage'] } }
    };
    const errors = checkDeclarationsAgainstCts({ data: { processNodes: nodes } }, registry, 'org-1');
    expect(errors).not.toContainEqual(expect.stringMatching(/^.*good fieldPolicy/));
    expect(errors).toContainEqual(expect.stringMatching(/offRow fieldPolicy visible names field ghost outside the widget row/));
    expect(errors).toContainEqual(expect.stringMatching(/stringy fieldPolicy editable must be a field list/));
    expect(errors).toContainEqual(expect.stringMatching(/cross fieldPolicy editable names stage outside visible/));
  });

  it('org overlay is the view: other orgs see system types only', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: { producerOutputs: { out1: { typeId: 'widget' } } }
    }, registry, 'org-2');
    expect(errors).toContain('Producer output out1 references unknown type widget');
  });

  it('ignores the presentation graph: canvas card kinds are not type references', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        graph: {
          nodes: [
            { id: 'f1', type: 'ctsField', position: { x: 0, y: 0 }, data: { refId: 'f1', typeId: 'widget' } },
            { id: 's1', type: 'ctsState', position: { x: 0, y: 0 }, data: { refId: 's1' } },
            { id: 'c1', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'c1' } },
            { id: 'p1', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'p1' } }
          ],
          edges: [{ id: 'e1', source: 'c1', target: 'p1', type: 'default' }]
        },
        processNodes: {
          p1: { id: 'p1', kind: 'cts.construct', typeId: 'widget', via: 'genericCreate' }
        }
      }
    }, registry, 'org-1');
    expect(errors).toEqual([]);
  });

  it('reads type bindings positionally: process descriptor strings are not references', () => {
    const registry = registryWithOrgType();
    // construction inputs carry process-vocabulary descriptors ('string'),
    // species records bind through typeId, legacy species records through
    // the bare `type` string.
    const errors = checkDeclarationsAgainstCts({
      data: {
        processNodes: {
          ctor: {
            id: 'ctor', kind: 'cts.construct', typeId: 'widget', via: 'genericCreate',
            construction: { mode: 'genericCreate', inputs: [{ id: 'name', type: 'string', required: true }] }
          },
          legacy: { id: 'legacy', kind: 'cts.mutate', type: 'ghost-type' },
          unbound: { id: 'unbound', kind: 'cts.construct', typeId: '', via: 'genericCreate' }
        }
      }
    }, registry, 'org-1');
    expect(errors).not.toContainEqual(expect.stringMatching(/unknown type string/));
    expect(errors).toContain('definition.processNodes.legacy references unknown type ghost-type');
  });
});
