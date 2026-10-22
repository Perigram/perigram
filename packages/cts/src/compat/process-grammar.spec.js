import { describe, it, expect } from 'vitest';
import {
  ctsFieldToProcessType, processTypeToCtsField, enumRegistryForView,
  SPECIES_BY_EFFECT_KIND, isProcessOnlyBase
} from './process-grammar.js';
import { checkDeclarationsAgainstCts } from './process-checks.js';
import { createTypeRegistry } from '../index.js';
import { cncTypePack } from '../pack/cnc.js';
import { frameworkTypes } from '../pack/framework.js';

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
    s2: { id: 's2', kind: 'state', typeId: 'widget', value: 'done', terminal: true }
  };
}

describe('grammar adapter (CTS <-> PROCESS_BASE_TYPES)', () => {
  it('maps the declaration subset losslessly in both directions', () => {
    const cases = [
      [{ base: 'string' }, { base: 'string' }],
      [{ base: 'quantity', unit: 'mm' }, { base: 'number', unit: 'mm' }],
      [{ base: 'instant' }, { base: 'dateTime' }],
      [{ base: 'ref', accepts: ['queue'] }, { base: 'entityRef', typeId: 'queue' }],
      [{ base: 'ref', accepts: ['occs', 'cut-plan'] }, { base: 'entityRef', accepts: ['occs', 'cut-plan'] }],
      [{ base: 'list', itemType: { base: 'number' } }, { base: 'array', itemType: { base: 'number' } }],
      [{ base: 'map', itemType: { base: 'string' } }, { base: 'map', keyType: { base: 'string' }, valueType: { base: 'string' } }],
      [{ base: 'blob' }, { base: 'attachmentRef' }]
    ];
    for (const [ctsDescriptor, expectedProcess] of cases) {
      const processType = ctsFieldToProcessType(ctsDescriptor);
      expect(processType).toEqual(expectedProcess);
      const back = processTypeToCtsField(processType);
      expect(back).toEqual(ctsDescriptor);
    }
  });

  it('reports runtime-only bases as unmappable instead of guessing', () => {
    expect(isProcessOnlyBase('entity')).toBe(true);
    expect(processTypeToCtsField({ base: 'status', typeId: 'queue' })).toBeNull();
    expect(processTypeToCtsField({ base: 'duration' })).toBeNull();
    expect(ctsFieldToProcessType({ base: 'variant', tags: ['a'] }).lossy).toBeTruthy();
  });

  it('derives the shared enum registry for enum fields only', () => {
    const registry = registryWithOrgType();
    const enums = enumRegistryForView(registry.listTypes('org-1'));
    expect(enums['widget#stage']).toEqual(['raw', 'done']);
    // State vocabularies never project (SPEC §7): no typeId#axis ids.
    expect(Object.keys(enums).some(id => id.endsWith('#main'))).toBe(false);
  });

  it('classifies the effect node family into CTS species', () => {
    expect(SPECIES_BY_EFFECT_KIND['effect.changeStatus']).toBe('transition');
    expect(SPECIES_BY_EFFECT_KIND['effect.runCommand']).toBe('command');
    expect(Object.keys(SPECIES_BY_EFFECT_KIND)).toHaveLength(9);
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

  it('checks state deadlines: parseable duration, declared target, guard contract', () => {
    const registry = registryWithOrgType();
    const states = {
      ...draftStateRecords(),
      s1: { ...draftStateRecords().s1, deadline: { after: 'PT48H', to: 'done' } },
      badAfter: { id: 'badAfter', kind: 'state', typeId: 'widget', value: 'new', deadline: { after: '2 days', to: 'done' } },
      badTo: { id: 'badTo', kind: 'state', typeId: 'widget', value: 'new', deadline: { after: 'PT1H', to: 'FLYING' } },
      selfTo: { id: 'selfTo', kind: 'state', typeId: 'widget', value: 'new', deadline: { after: 'PT1H', to: 'new' } },
      badGuard: { id: 'badGuard', kind: 'state', typeId: 'widget', value: 'new', deadline: { after: 'PT1H', to: 'done', guard: { op: 'map', list: { op: 'lit', value: [] }, var: 'x', body: { op: 'var', name: 'x' } } } }
    };
    const errors = checkDeclarationsAgainstCts({ data: { ctsTypes: states } }, registry, 'org-1');
    expect(errors).not.toContainEqual(expect.stringMatching(/^.*s1 deadline/));
    expect(errors).toContainEqual(expect.stringMatching(/badAfter deadline: after must be an ISO-8601 duration/));
    expect(errors).toContainEqual(expect.stringMatching(/badTo deadline: to FLYING is not declared for widget/));
    expect(errors).toContainEqual(expect.stringMatching(/selfTo deadline: to must name another declared state/));
    expect(errors).toContainEqual(expect.stringMatching(/badGuard deadline guard: op map is not boolean vocabulary/));
  });

  it('checks state field policies: row-checked lists, array shape', () => {
    const registry = registryWithOrgType();
    const states = {
      ...draftStateRecords(),
      good: { id: 'good', kind: 'state', typeId: 'widget', value: 'held', fieldPolicy: { visible: ['name', 'stage'], editable: ['stage'] } },
      offRow: { id: 'offRow', kind: 'state', typeId: 'widget', value: 'held2', fieldPolicy: { visible: ['ghost'] } },
      stringy: { id: 'stringy', kind: 'state', typeId: 'widget', value: 'held3', fieldPolicy: { editable: 'name' } },
      unscoped: { id: 'unscoped', kind: 'state', typeId: null, value: 'held4', fieldPolicy: { visible: ['anything'] } }
    };
    const errors = checkDeclarationsAgainstCts({ data: { ctsTypes: states } }, registry, 'org-1');
    expect(errors).not.toContainEqual(expect.stringMatching(/^.*good fieldPolicy/));
    expect(errors).toContainEqual(expect.stringMatching(/offRow fieldPolicy visible names field ghost outside the widget row/));
    expect(errors).toContainEqual(expect.stringMatching(/stringy fieldPolicy editable must be a field list/));
    expect(errors).not.toContainEqual(expect.stringMatching(/unscoped fieldPolicy/));
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
