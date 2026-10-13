// The "?" node-spec tooltip: every species operation kind carries a
// human-readable spec; socket lines render name — type · access · optional.
import { describe, it, expect } from 'vitest';
import { nodeSpecSummary, socketSpecLine } from '../composables/useNodeSpec.js';
import { formatProcessType } from '../packages/processes/src/index.js';

describe('node spec tooltip', () => {
  it('describes every v5 species operation', () => {
    for (const kind of ['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove', 'cts.service', 'cts.read', 'cts.field', 'cts.compose', 'cts.decompose', 'source.currentUser', 'source.currentOrganization']) {
      const summary = nodeSpecSummary({ kind }, formatProcessType);
      expect(summary, kind).toMatch(/[a-z]/);
      expect(summary.length, kind).toBeGreaterThan(20);
    }
  });

  it('v4 records resolve to nothing: authored definitions speak the current species vocabulary only', () => {
    // The v4 twin table is retired with the kinds — a v4 record carries no
    // species spec, exactly like the retired read spellings below.
    expect(nodeSpecSummary({ kind: 'effect.changeStatus', typeId: 'queue' }, formatProcessType)).toBe('');
    expect(nodeSpecSummary({ kind: 'record.getField' }, formatProcessType)).toBe('');
    expect(nodeSpecSummary({ kind: 'read.currentEntity' }, formatProcessType)).toBe('');
  });

  it('socket lines carry type, access, and optionality', () => {
    expect(socketSpecLine({ id: 'entity', label: 'entity', type: { base: 'entityRef', typeId: 'cassette' }, required: true }, formatProcessType))
      .toBe('entity — entityRef<cassette>');
    expect(socketSpecLine({ id: 'items', type: { base: 'entity' }, access: 'list', required: false }, formatProcessType))
      .toBe('items — entity · list · optional');
  });
});
