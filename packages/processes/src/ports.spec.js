import { describe, expect, it } from 'vitest';
import { portSpecsCompatible, resolveProcessNodePorts } from './ports.js';

describe('process programming node ports', () => {
  it('gives every string operation its actual input arity and scalar types', () => {
    expect(resolveProcessNodePorts({ kind: 'stringOp', operation: 'concat' })).toEqual({
      inputs: [
        expect.objectContaining({ id: 'value', label: 'left', kind: 'string', required: true }),
        expect.objectContaining({ id: 'right', kind: 'string', required: true })
      ],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string' })]
    });
    expect(resolveProcessNodePorts({ kind: 'stringOp', operation: 'replace' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'value', kind: 'string' }),
        expect.objectContaining({ id: 'search', kind: 'string' }),
        expect.objectContaining({ id: 'replacement', kind: 'string' })
      ]);
  });

  it('uses operation-specific comparison and logic contracts', () => {
    expect(resolveProcessNodePorts({ kind: 'compare', operation: 'gt' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'left', kind: 'number' }),
        expect.objectContaining({ id: 'right', kind: 'number' })
      ]);
    expect(resolveProcessNodePorts({ kind: 'logic', operation: 'not' }).inputs)
      .toEqual([expect.objectContaining({ id: 'left', label: 'value', kind: 'boolean' })]);
    expect(resolveProcessNodePorts({ kind: 'logic', operation: 'xor', structure: 'list' }))
      .toEqual({
        inputs: [
          expect.objectContaining({ id: 'left', kind: 'boolean_list' }),
          expect.objectContaining({ id: 'right', kind: 'boolean_list' })
        ],
        outputs: [expect.objectContaining({ id: 'result', kind: 'boolean_list' })]
      });
  });

  it('keeps missing-value fallback in the value family and broadcasts one fallback over a list', () => {
    expect(resolveProcessNodePorts({ kind: 'fallback', valueType: 'string', structure: 'list' })).toEqual({
      inputs: [
        expect.objectContaining({ id: 'value', kind: 'string_list' }),
        expect.objectContaining({ id: 'fallback', kind: 'string' })
      ],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string_list' })]
    });
  });

  it('rejects wiring unlike scalar types while allowing typed values into generic data inputs', () => {
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'number' }).ok).toBe(false);
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'data' }).ok).toBe(true);
  });

  it('preserves list structure through entity projection, predicates, and filtering', () => {
    expect(resolveProcessNodePorts({ kind: 'entityQuery', entityType: 'queue' }).outputs)
      .toEqual([expect.objectContaining({ id: 'entities', kind: 'entity_list', entityType: 'queue' })]);
    expect(resolveProcessNodePorts({
      kind: 'entityField',
      entityType: 'queue',
      path: 'status.state.primary',
      valueType: 'string',
      structure: 'list'
    })).toEqual({
      inputs: [expect.objectContaining({ id: 'entity', kind: 'entity_list' })],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string_list' })]
    });
    expect(resolveProcessNodePorts({ kind: 'entityFilter', entityType: 'queue' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'entities', kind: 'entity_list' }),
        expect.objectContaining({ id: 'mask', kind: 'boolean_list' })
      ]);
  });
});
