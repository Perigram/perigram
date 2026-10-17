import { describe, expect, it } from 'vitest';
import { composePackEditors, composeSystemDeclarations } from '~/server/packs/declarations.js';

// Guard: the editor-binding serving seam (pack mount composition) only
// accepts bindings for payload-bearing file types. The real packs must
// compose cleanly; mutated mounts must be refused with the binding named.
describe('pack editor binding guards', () => {
  it('composes the (empty) mounted set without violations', () => {
    // No pack mounts anymore (documents and tech-drawing retired into
    // their plugins); the real editor laws live in the SDK's listing
    // contract. The seam must still compose cleanly over the empty set.
    expect(composePackEditors()).toEqual([]);
  });

  it('rejects an editor binding for a non-file class, naming the binding', () => {
    expect(() => composePackEditors([
      {
        id: 'documents',
        requires: [],
        types: [
          { id: 'project', class: 'group', version: 1, name: 'Project', fields: { name: { base: 'string' } } }
        ],
        editors: [{ type: 'project', surface: 'text-editor', modes: ['edit'] }]
      }
    ])).toThrow(/pack documents binds an editor for type project of class group — editor bindings require file types/);
  });

  it('rejects an editor binding for a type no mounted pack declares', () => {
    expect(() => composePackEditors([
      { id: 'documents', requires: [], types: [], editors: [{ type: 'mystery', surface: 'text-editor', modes: ['edit'] }] }
    ])).toThrow(/pack documents binds an editor for type mystery, which no mounted pack declares/);
  });
});
