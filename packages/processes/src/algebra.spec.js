import { describe, expect, it } from 'vitest';
import { resolveProcessActionInputContext } from './algebra.js';

describe('process programming algebra', () => {
  it('evaluates connected scalar nodes into an action field', async () => {
    const process = {
      actions: {
        rename: {
          id: 'rename',
          actionKind: 'updateEntity',
          inputs: [{ id: 'field:identity.name', kind: 'data', dataPath: 'identity.name' }]
        }
      },
      valueInputs: {
        prefix: { id: 'prefix', valueType: 'string', value: 'Job ' },
        serial: { id: 'serial', valueType: 'string', value: '42' }
      },
      processNodes: {
        join: { id: 'join', kind: 'stringOp', operation: 'concat' }
      },
      graph: {
        nodes: [
          { id: 'prefix', type: 'valueInput' },
          { id: 'serial', type: 'valueInput' },
          { id: 'join', type: 'processNode' },
          { id: 'rename', type: 'action' }
        ],
        edges: [
          { source: 'prefix', sourceHandle: 'output', target: 'join', targetHandle: 'input:value' },
          { source: 'serial', sourceHandle: 'output', target: 'join', targetHandle: 'input:right' },
          { source: 'join', sourceHandle: 'output', target: 'rename', targetHandle: 'input' }
        ]
      }
    };

    await expect(resolveProcessActionInputContext(process, 'rename')).resolves.toEqual({
      data: { identity: { name: 'Job 42' } },
      parameters: {},
      entities: {}
    });
  });

  it('reads an entity block field and applies a text template', async () => {
    const process = {
      actions: {
        command: {
          id: 'command',
          actionKind: 'runCommand',
          inputs: [{ id: 'label', kind: 'string' }]
        }
      },
      producerOutputs: {
        'queue:entity': {
          id: 'queue:entity',
          producerOutputId: 'queue:entity',
          nodeId: 'queue',
          outputSocketId: 'entity',
          entityType: 'queue',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: [], write: [], private: [] }
        }
      },
      processNodes: {
        decompose: { id: 'decompose', kind: 'entityDecompose', entityType: 'queue' },
        read: { id: 'read', kind: 'blockRead', block: 'identity', path: 'identity.name', valueType: 'string' },
        template: { id: 'template', kind: 'stringOp', operation: 'template', template: 'Queue: {value}' }
      },
      graph: {
        nodes: [
          { id: 'queue', type: 'entity', data: { refId: 'queue:entity' } },
          { id: 'decompose', type: 'processNode' },
          { id: 'read', type: 'processNode' },
          { id: 'template', type: 'processNode' },
          { id: 'command', type: 'action' }
        ],
        edges: [
          { source: 'queue', sourceHandle: 'output', target: 'decompose', targetHandle: 'input' },
          { source: 'decompose', sourceHandle: 'output:identity', target: 'read', targetHandle: 'input' },
          { source: 'read', sourceHandle: 'output', target: 'template', targetHandle: 'input' },
          { source: 'template', sourceHandle: 'output', target: 'command', targetHandle: 'input' }
        ]
      }
    };

    const result = await resolveProcessActionInputContext(process, 'command', {}, {
      resolveEntity: async () => ({ identity: { uid: 'queue-1', name: 'Monday' } })
    });

    expect(result.parameters).toEqual({ label: 'Queue: Monday' });
  });

  it('omits incomplete operation inputs instead of rejecting the graph', async () => {
    const process = {
      actions: { action: { id: 'action', actionKind: 'runCommand', inputs: [{ id: 'label' }] } },
      valueInputs: { value: { id: 'value', valueType: 'string', value: 'only one' } },
      processNodes: { join: { id: 'join', kind: 'stringOp', operation: 'concat' } },
      graph: {
        nodes: [
          { id: 'value', type: 'valueInput' },
          { id: 'join', type: 'processNode' },
          { id: 'action', type: 'action' }
        ],
        edges: [
          { source: 'value', target: 'join', targetHandle: 'input:value' },
          { source: 'join', target: 'action' }
        ]
      }
    };

    await expect(resolveProcessActionInputContext(process, 'action'))
      .resolves.toMatchObject({ parameters: { label: 'only one' } });
  });

  it('casts explicitly and applies a scalar fallback element-wise without changing list structure', async () => {
    const process = {
      actions: { action: { id: 'action', actionKind: 'runCommand', inputs: [{ id: 'values', kind: 'data' }] } },
      valueInputs: {
        values: { id: 'values', valueType: 'json', structure: 'list', value: '[null,3]' },
        fallback: { id: 'fallback', valueType: 'json', structure: 'item', value: '0' }
      },
      processNodes: {
        defaulted: { id: 'defaulted', kind: 'fallback', valueType: 'json', structure: 'list' },
        cast: { id: 'cast', kind: 'cast', valueType: 'number', structure: 'list' }
      },
      graph: {
        nodes: ['values', 'fallback'].map(id => ({ id, type: 'valueInput' }))
          .concat(['defaulted', 'cast'].map(id => ({ id, type: 'processNode' })), [{ id: 'action', type: 'action' }]),
        edges: [
          { source: 'values', target: 'defaulted', targetHandle: 'input:value' },
          { source: 'fallback', target: 'defaulted', targetHandle: 'input:fallback' },
          { source: 'defaulted', target: 'cast' },
          { source: 'cast', target: 'action' }
        ]
      }
    };

    const result = await resolveProcessActionInputContext(process, 'action');
    expect(result.parameters.values).toEqual([0, 3]);
  });

  it('leaves action-to-action runtime values in the submitted execution context', async () => {
    const process = {
      actions: {
        previous: { id: 'previous', outputs: [{ id: 'entity', entityType: 'queue' }] },
        next: { id: 'next', inputs: [{ id: 'entity', entityType: 'queue' }] }
      },
      graph: {
        nodes: [
          { id: 'previous', type: 'action' },
          { id: 'next', type: 'action' }
        ],
        edges: [
          { source: 'previous', sourceHandle: 'output', target: 'next', targetHandle: 'input' }
        ]
      }
    };

    await expect(resolveProcessActionInputContext(process, 'next', {
      entities: { entity: 'queue-1' }
    })).resolves.toEqual({
      data: {},
      parameters: {},
      entities: { entity: 'queue-1' }
    });
  });

  it('queries entities, builds a typed field predicate, filters, and selects', async () => {
    const process = {
      actions: {
        command: {
          id: 'command',
          actionKind: 'runCommand',
          inputs: [{ id: 'queue', kind: 'entity', entityType: 'queue' }]
        }
      },
      valueInputs: {
        target: { id: 'target', valueType: 'string', structure: 'item', value: 'READY' }
      },
      processNodes: {
        query: { id: 'query', kind: 'entityQuery', entityType: 'queue' },
        ready: { id: 'ready', kind: 'entityCondition', entityType: 'queue', path: 'status.state.primary', operation: 'eq', valueType: 'string' },
        filter: { id: 'filter', kind: 'entityFilter', entityType: 'queue' },
        first: { id: 'first', kind: 'entitySelect', entityType: 'queue', operation: 'first' }
      },
      graph: {
        nodes: [
          { id: 'target', type: 'valueInput' },
          ...['query', 'ready', 'filter', 'first'].map(id => ({ id, type: 'processNode' })),
          { id: 'command', type: 'action' }
        ],
        edges: [
          { source: 'target', target: 'ready', targetHandle: 'input:value' },
          { source: 'query', target: 'filter', targetHandle: 'input:entities' },
          { source: 'ready', target: 'filter', targetHandle: 'input:predicate' },
          { source: 'filter', target: 'first', targetHandle: 'input' },
          { source: 'first', target: 'command', targetHandle: 'input' }
        ]
      }
    };

    const result = await resolveProcessActionInputContext(process, 'command', {}, {
      queryEntities: async () => [
        { identity: { uid: 'q1' }, status: { state: { primary: 'DRAFT' } } },
        { identity: { uid: 'q2' }, status: { state: { primary: 'READY' } } }
      ]
    });

    expect(result.entities.queue).toEqual({ type: 'queue', id: 'q2' });
  });

  it('combines field predicates before filtering instead of aligning Boolean arrays', async () => {
    const process = {
      actions: {
        command: { id: 'command', actionKind: 'runCommand', inputs: [{ id: 'queue', kind: 'entity', entityType: 'queue' }] }
      },
      valueInputs: {
        readyValue: { id: 'readyValue', valueType: 'string', value: 'READY' },
        minimumArea: { id: 'minimumArea', valueType: 'number', value: 10 }
      },
      processNodes: {
        query: { id: 'query', kind: 'entityQuery', entityType: 'queue' },
        ready: { id: 'ready', kind: 'entityCondition', entityType: 'queue', path: 'status.state.primary', operation: 'eq', valueType: 'string' },
        large: { id: 'large', kind: 'entityCondition', entityType: 'queue', path: 'summary.totalArea', operation: 'gte', valueType: 'number' },
        both: { id: 'both', kind: 'predicateLogic', entityType: 'queue', operation: 'and' },
        filter: { id: 'filter', kind: 'entityFilter', entityType: 'queue' },
        first: { id: 'first', kind: 'entitySelect', entityType: 'queue', operation: 'first' }
      },
      graph: {
        nodes: [
          ...['readyValue', 'minimumArea'].map(id => ({ id, type: 'valueInput' })),
          ...['query', 'ready', 'large', 'both', 'filter', 'first'].map(id => ({ id, type: 'processNode' })),
          { id: 'command', type: 'action' }
        ],
        edges: [
          { source: 'readyValue', target: 'ready', targetHandle: 'input:value' },
          { source: 'minimumArea', target: 'large', targetHandle: 'input:value' },
          { source: 'ready', target: 'both', targetHandle: 'input:left' },
          { source: 'large', target: 'both', targetHandle: 'input:right' },
          { source: 'query', target: 'filter', targetHandle: 'input:entities' },
          { source: 'both', target: 'filter', targetHandle: 'input:predicate' },
          { source: 'filter', target: 'first' },
          { source: 'first', target: 'command' }
        ]
      }
    };

    const result = await resolveProcessActionInputContext(process, 'command', {}, {
      queryEntities: async () => [
        { identity: { uid: 'q1' }, status: { state: { primary: 'READY' } }, summary: { totalArea: 4 } },
        { identity: { uid: 'q2' }, status: { state: { primary: 'DRAFT' } }, summary: { totalArea: 20 } },
        { identity: { uid: 'q3' }, status: { state: { primary: 'READY' } }, summary: { totalArea: 20 } }
      ]
    });

    expect(result.entities.queue).toEqual({ type: 'queue', id: 'q3' });
  });
});
