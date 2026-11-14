// Socket lines are the designer tooltip's contract: "name — Type · list ·
// optional", computed from the node's real ports. The per-kind spec text
// died with the one-item-per-operation tooltip cut.
import { describe, it, expect } from 'vitest';
import { socketSpecLine } from '../composables/useNodeSpec.js';
import { formatProcessType } from '@perigram/processes/index';

describe('node spec tooltip', () => {
  it('socket lines carry type, access, and optionality', () => {
    expect(socketSpecLine({ id: 'entity', label: 'entity', type: { base: 'entityRef', typeId: 'cassette' }, required: true }, formatProcessType))
      .toBe('entity — entityRef<cassette>');
    expect(socketSpecLine({ id: 'items', type: { base: 'entity' }, access: 'list', required: false }, formatProcessType))
      .toBe('items — entity · list · optional');
    expect(socketSpecLine({ id: 'value', type: { base: 'entityRef', typeId: 'user' }, required: false }, formatProcessType))
      .toBe('value — entityRef<user> · optional');
  });
});
