import { describe, expect, it } from 'vitest';
import { migrateProcessDefinitionV4 } from './migration-v4.js';

describe('process v4 migration', () => {
  it('removes static shapes and materializes an explicit array collector', () => {
    const result = migrateProcessDefinitionV4({
      dataflowVersion: 3,
      processNodes: {
        query: { id: 'query', kind: 'read.queryEntities', type: { base: 'entity', shape: 'list', entityType: 'artifact' } },
        compose: { id: 'compose', kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations', entries: [{ id: 'artifacts', key: 'artifacts', entityType: 'artifact', cardinality: 'many', operation: 'replace' }] }
      },
      graph: {
        nodes: [{ id: 'query', type: 'processNode', position: { x: 0, y: 0 } }, { id: 'compose', type: 'processNode', position: { x: 200, y: 0 } }],
        edges: [{ id: 'link', source: 'query', sourceHandle: 'output:entities', target: 'compose', targetHandle: 'input:entry:artifacts' }]
      }
    });
    expect(result.errors).toEqual([]);
    expect(result.data.dataflowVersion).toBe(4);
    expect(JSON.stringify(result.data)).not.toContain('"shape"');
    expect(Object.values(result.data.processNodes).some(node => node.kind === 'collection.packArray')).toBe(true);
  });

  it('fails closed for mutation semantics that need author review', () => {
    const result = migrateProcessDefinitionV4({ dataflowVersion: 3, processNodes: { compose: { kind: 'record.modifyBlock', entries: [{ id: 'x', operation: 'append' }] } } });
    expect(result.errors[0]).toContain('explicit array/list operations');
  });
});
