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
    expect(resolveProcessNodePorts({ kind: 'logic', operation: 'coalesce', valueType: 'json' }))
      .toEqual({
        inputs: [
          expect.objectContaining({ id: 'left', kind: 'json' }),
          expect.objectContaining({ id: 'right', kind: 'json' })
        ],
        outputs: [expect.objectContaining({ id: 'result', kind: 'json' })]
      });
  });

  it('rejects wiring unlike scalar types while allowing typed values into generic data inputs', () => {
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'number' }).ok).toBe(false);
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'data' }).ok).toBe(true);
  });
});
