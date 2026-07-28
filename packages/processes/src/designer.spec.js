import { describe, expect, it } from 'vitest';
import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { createProcessDesignerContract } from './designer.js';

describe('process designer domain contract', () => {
  const domain = {
    entities: [
      { type: 'work_item', label: 'Work item', collection: 'work_items', blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data'] },
      { type: 'result', collection: 'results', blocks: ['identity', 'status', 'specs', 'summary'] }
    ],
    commands: {
      calculate: { id: 'calculate', label: 'Calculate' }
    },
    tasks: { calculateTask: { id: 'calculate.task', label: 'Calculate task' } },
    events: { calculated: { id: 'calculated', label: 'Calculated' } },
    hooks: { audit: { id: 'audit', label: 'Audit' } },
    effects: { notify: { id: 'notify', label: 'Notify' } },
    attachmentKinds: { report: { kind: 'REPORT', label: 'Report' } },
    workflows: { work_item: { label: 'Work item lifecycle' } },
    fieldAccess: {
      workItem: {
        read: ['identity.*', 'origin.*', 'status.*', 'lineage.*', 'relations.*', 'provenance.*', 'data.note'],
        write: ['identity.name', 'relations.owner', 'data.note'],
        admin: ['attachments.*']
      }
    },
    fieldSchemas: {
      workItem: [
        { path: 'identity.name', block: 'identity', label: 'Name', type: { base: 'string', shape: 'item', nullable: false }, readable: true, writable: true },
        { path: 'relations.owner', block: 'relations', label: 'Owner', type: { base: 'entityRef', shape: 'item', nullable: true }, readable: true, writable: true }
      ]
    },
    construction: {
      work_item: {
        modes: ['genericCreate'],
        defaultMode: 'genericCreate',
        inputs: [{ id: 'name', path: 'identity.name', type: 'string' }]
      }
    }
  };

  it('projects a domain implementation through framework-owned designer contracts', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.entityOptions).toContainEqual({ label: 'Work item', value: 'work_item' });
    expect(contract.commandOptions).toEqual([{ label: 'Calculate', value: 'calculate' }]);
    expect(contract.taskOptions).toEqual([{ label: 'Calculate task', value: 'calculate.task' }]);
    expect(contract.eventOptions).toEqual([{ label: 'Calculated', value: 'calculated' }]);
    expect(contract.hookOptions).toEqual([{ label: 'Audit', value: 'audit' }]);
    expect(contract.effectOptions).toEqual([{ label: 'Notify', value: 'notify' }]);
    expect(contract.attachmentKindOptions).toEqual([{ label: 'Report', value: 'REPORT' }]);
    expect(contract.workflowOptions).toEqual([{ label: 'Work item lifecycle', value: 'work_item' }]);
    expect(contract.construction('work_item').inputs[0].path).toBe('identity.name');
    expect(contract.fieldPolicy('work_item').write).toContain('relations.owner');
  });

  it('exposes every core block and limits entity decomposition to declared domain blocks', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.blocks.map(block => block.id)).toEqual(CANONICAL_ENTITY_BLOCKS);
    expect(contract.blocksForEntity('work_item').map(block => block.id)).toEqual([
      'identity',
      'origin',
      'status',
      'lineage',
      'relations',
      'provenance',
      'attachments',
      'data'
    ]);
    expect(contract.fieldsForEntity('work_item', 'relations')).toEqual([
      {
        path: 'relations.owner',
        block: 'relations',
        label: 'Owner',
        value: 'relations.owner',
        type: { base: 'entityRef', shape: 'item', nullable: true },
        readable: true,
        writable: true
      }
    ]);
  });

  it('provides generic construction for any registered entity', () => {
    const contract = createProcessDesignerContract(domain);

    expect(contract.construction('result')).toEqual({
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: []
    });
  });

  it('separates sources, values, collections, records, predicates, reads, effects, and control', () => {
    const contract = createProcessDesignerContract(domain);
    const groups = Object.fromEntries(contract.paletteGroups.map(group => [group.id, group.items]));

    expect(Object.keys(groups)).toEqual(['sources', 'values', 'collections', 'records', 'predicates', 'reads', 'effects', 'control']);
    expect(groups.sources.map(item => item.kind)).toContain('source.literalTree');
    expect(groups.collections.map(item => item.kind)).toContain('tree.cross');
    expect(groups.records.map(item => item.kind)).toContain('record.fieldChange');
    expect(groups.reads.map(item => item.kind)).toContain('read.queryEntities');
    expect(groups.control.map(item => item.kind)).toContain('control.forEach');
    expect(contract.fieldType('work_item', 'identity.name')).toMatchObject({ base: 'string', shape: 'item' });
  });
});
