// The "?" node-spec tooltip: every species operation kind carries a
// human-readable spec; socket lines render name — type · access · optional.
import { describe, it, expect } from 'vitest';
import { nodeSpecSummary, socketSpecLine } from '../composables/useNodeSpec.js';
import { formatProcessType } from '../packages/processes/src/index.js';

describe('node spec tooltip', () => {
  it('describes every v5 species operation', () => {
    for (const kind of ['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove', 'cts.service', 'cts.read', 'cts.field', 'cts.compose', 'cts.decompose', 'cts.join']) {
      const summary = nodeSpecSummary({ kind }, formatProcessType);
      expect(summary, kind).toMatch(/[a-z]/);
      expect(summary.length, kind).toBeGreaterThan(20);
    }
  });

  it('v4 records resolve to species descriptions through the operation-kind seam', () => {
    expect(nodeSpecSummary({ kind: 'effect.changeStatus', typeId: 'queue' }, formatProcessType)).toMatch(/state machine/i);
    expect(nodeSpecSummary({ kind: 'read.currentEntity' }, formatProcessType)).toMatch(/context/i);
  });

  it('socket lines carry type, access, and optionality', () => {
    expect(socketSpecLine({ id: 'entity', label: 'entity', type: { base: 'entityRef', typeId: 'cassette' }, required: true }, formatProcessType))
      .toBe('entity — entityRef<cassette>');
    expect(socketSpecLine({ id: 'items', type: { base: 'entity' }, access: 'list', required: false }, formatProcessType))
      .toBe('items — entity · list · optional');
  });
});
