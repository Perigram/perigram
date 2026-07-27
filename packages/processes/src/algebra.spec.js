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
      entityProfiles: {
        queue: { id: 'queue', entityType: 'queue' }
      },
      processNodes: {
        decompose: { id: 'decompose', kind: 'fieldRead', entityType: 'queue' },
        read: { id: 'read', kind: 'blockRead', block: 'identity', path: 'identity.name', valueType: 'string' },
        template: { id: 'template', kind: 'stringOp', operation: 'template', template: 'Queue: {value}' }
      },
      graph: {
        nodes: [
          { id: 'queue', type: 'entity' },
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

  it('rejects incomplete operations instead of evaluating placeholders', async () => {
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
      .rejects.toThrow('Process node join requires input right');
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
});
