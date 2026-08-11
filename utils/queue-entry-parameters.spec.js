import { describe, expect, it } from 'vitest';
import { queueEntryParameterNames } from './queue-entry-parameters.js';

describe('queue entry parameters', () => {
  it('keeps persisted parameters editable regardless of nesting behavior type', () => {
    expect(queueEntryParameterNames({
      type: 'STATIC',
      dimensions: { A: 200, B: 1000, R: 10 }
    })).toEqual(['A', 'B', 'R']);
  });

  it('combines source parameter order with entry-only values', () => {
    expect(queueEntryParameterNames(
      { dimensions: { R: 10, A: 200, custom: 1 } },
      ['A', 'B', 'R']
    )).toEqual(['A', 'B', 'R', 'custom']);
  });
});
