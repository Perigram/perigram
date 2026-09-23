import { describe, expect, it } from 'vitest';
import { composePackEditors, composeSystemDeclarations } from '~/server/packs/declarations.js';

// Guard: the editor-binding serving seam (pack mount composition) only
// accepts bindings for payload-bearing file types. The real packs must
// compose cleanly; mutated mounts must be refused with the binding named.
describe('pack editor binding guards', () => {
  it('composes the real mounted packs without violations', () => {
    const editors = composePackEditors();
    const declarations = new Map(composeSystemDeclarations().map(declaration => [declaration.id, declaration]));
    expect(editors.length).toBeGreaterThan(0);
    for (const editor of editors) {
      expect(declarations.get(editor.type)?.class, editor.type).toBe('file');
    }
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
