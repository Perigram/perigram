import { describe, expect, it } from 'vitest';
import { createPaletteGroups } from './create-palette.js';

const actions = [
  { id: 'new-doc', actionKind: 'createInstance', typeId: 'text-document', label: 'New Text Document' },
  { id: 'new-md', actionKind: 'createInstance', typeId: 'text-document', label: 'New Text Document from Upload', construction: { mode: 'upload' } },
  { id: 'new-request', actionKind: 'createInstance', typeId: 'request', label: 'New Request' },
  { id: 'approve', actionKind: 'updateInstance', typeId: 'request', label: 'Approve' },
  { id: 'loose', actionKind: 'createInstance', label: 'No type' }
];

const typeLabelOf = typeId => ({ 'text-document': 'Text Document', request: 'Request' }[typeId] || typeId);

describe('create palette groups', () => {
  it('groups compiled creates by type label and drops non-create or untyped actions', () => {
    const groups = createPaletteGroups(actions, { typeLabelOf });
    expect(groups.map(group => group.label)).toEqual(['Request', 'Text Document']);
    expect(groups[1].items.map(item => item.label)).toEqual(['New Text Document', 'New Text Document from Upload']);
  });

  it('filters by action label, keeping the group for a type-label match', () => {
    const byAction = createPaletteGroups(actions, { query: 'upload', typeLabelOf });
    expect(byAction.length).toBe(1);
    expect(byAction[0].items.map(item => item.action.id)).toEqual(['new-md']);

    const byType = createPaletteGroups(actions, { query: 'request', typeLabelOf });
    expect(byType.length).toBe(1);
    expect(byType[0].items.map(item => item.action.id)).toEqual(['new-request']);
  });

  it('matches the search case-insensitively and yields nothing on a miss', () => {
    expect(createPaletteGroups(actions, { query: 'TEXT DOCUMENT', typeLabelOf })[0].items.length).toBe(2);
    expect(createPaletteGroups(actions, { query: 'zzz', typeLabelOf })).toEqual([]);
  });
});
