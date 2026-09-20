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
    fields: { name: { base: 'string' }, stage: { base: 'enum', values: ['raw', 'done'] } },
    states: { main: { initial: 'raw', values: ['raw', 'done'], terminal: ['done'] } },
    transitions: [{ from: 'raw', to: 'done', intent: 'finish' }]
  });
  return registry;
}

describe('grammar adapter (CTS <-> PROCESS_BASE_TYPES)', () => {
  it('maps the declaration subset losslessly in both directions', () => {
    const cases = [
      [{ base: 'string' }, { base: 'string' }],
      [{ base: 'quantity', unit: 'mm' }, { base: 'number', unit: 'mm' }],
      [{ base: 'instant' }, { base: 'dateTime' }],
      [{ base: 'ref', accepts: ['queue'] }, { base: 'entityRef', entityType: 'queue' }],
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
    expect(processTypeToCtsField({ base: 'status', entityType: 'queue' })).toBeNull();
    expect(processTypeToCtsField({ base: 'duration' })).toBeNull();
    expect(ctsFieldToProcessType({ base: 'variant', tags: ['a'] }).lossy).toBeTruthy();
  });

  it('derives a shared enum registry for states and enum fields', () => {
    const registry = registryWithOrgType();
    const enums = enumRegistryForView(registry.listTypes('org-1'));
    expect(enums['widget#main']).toEqual(['raw', 'done']);
    expect(enums['widget#stage']).toEqual(['raw', 'done']);
    expect(enums['queue#main']).toEqual(expect.arrayContaining(['draft', 'nesting']));
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
        producerOutputs: { out1: { entityType: 'queue' } },
        sockets: { s1: { type: { base: 'entityRef', entityType: 'widget' } } }
      }
    }, registry, 'org-1');
    expect(errors).toEqual([]);
  });

  it('rejects unknown entity types across record collections', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        producerOutputs: { out1: { entityType: 'nope' } },
        sockets: { s1: { type: { base: 'entityRef', entityType: 'ghost' } } }
      }
    }, registry, 'org-1');
    expect(errors).toContain('Producer output out1 references unknown type nope');
    expect(errors).toContain('Socket s1 references unknown type ghost');
  });

  it('rejects transitions to undeclared states and fields outside real rows', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: {
        producerOutputs: { w: { entityType: 'widget' }, q: { entityType: 'queue' } },
        actions: {
          bad: { actionKind: 'changeStatus', entityType: 'widget', targetStatus: 'FLYING' },
          good: { actionKind: 'changeStatus', entityType: 'widget', targetStatus: 'done' }
        },
        processNodes: {
          n1: { kind: 'record.getField', entityType: 'widget', field: 'data.name' },
          n2: { kind: 'record.getField', entityType: 'widget', field: 'data.rogue' },
          n3: { kind: 'record.getField', entityType: 'queue', field: 'data.job' },
          n4: { kind: 'record.getField', entityType: 'queue', field: 'data.rogue' },
          n5: { kind: 'record.getField', entityType: 'queue', field: 'identity.name' }
        }
      }
    }, registry, 'org-1');
    expect(errors).toContainEqual(expect.stringMatching(/moves widget to undeclared state FLYING/));
    expect(errors).toContainEqual(expect.stringMatching(/uses field data.rogue outside the widget row/));
    // queue rows are declared: the job root resolves, unknown roots fail,
    // managed blocks (identity) are policy facets, not rows
    expect(errors).not.toContainEqual(expect.stringMatching(/data\.job/));
    expect(errors).toContainEqual(expect.stringMatching(/uses field data.rogue outside the queue row/));
    expect(errors).not.toContainEqual(expect.stringMatching(/identity\.name/));
  });

  it('org overlay is the view: other orgs see system types only', () => {
    const registry = registryWithOrgType();
    const errors = checkDeclarationsAgainstCts({
      data: { producerOutputs: { out1: { entityType: 'widget' } } }
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
});
