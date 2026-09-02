import { describe, expect, it } from 'vitest';
import { migratePersistedProcessProducerIdentities } from './migrate-process-producer-identities.js';

const domain = {
  entities: [{ type: 'work_item' }],
  commands: {},
  blockComposition: {}
};

function definition(outputs = [{
  id: 'result',
  type: { base: 'entity', entityType: 'work_item', nullable: false }
}]) {
  return {
    dataflowVersion: 4,
    processNodes: {
      processNode_1785860422855: {
        id: 'processNode_1785860422855',
        kind: 'effect.createEntity',
        entityType: 'work_item',
        outputs
      }
    },
    producerOutputs: {}
  };
}

describe('process producer identity data migration', () => {
  it('rewrites the reported persisted node without compiling or selecting by entity type', () => {
    const result = migratePersistedProcessProducerIdentities(definition(), domain);

    expect(result.changed).toBe(true);
    expect(result.data.processNodes.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
    expect(result.data.producerOutputs).toHaveProperty('processNode_1785860422855:result');
  });

  it('fails the record instead of selecting one ambiguous socket', () => {
    expect(() => migratePersistedProcessProducerIdentities(definition([
      { id: 'first', type: { base: 'entity', entityType: 'work_item' } },
      { id: 'second', type: { base: 'entity', entityType: 'work_item' } }
    ]), domain)).toThrow(
      'Process node processNode_1785860422855 requires one work_item producer output; candidates: '
      + 'processNode_1785860422855:first (work_item), processNode_1785860422855:result (work_item), '
      + 'processNode_1785860422855:second (work_item)'
    );
  });
});
