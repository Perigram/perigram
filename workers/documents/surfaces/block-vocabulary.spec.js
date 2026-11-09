import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/prose/model';
import { EditorState, TextSelection } from '@milkdown/prose/state';
import { insertViewFence } from './lib/block-vocabulary.mjs';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0]
    },
    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      attrs: { language: { default: '' } },
      parseDOM: [{ tag: 'pre' }],
      toDOM: () => ['pre', ['code', 0]]
    },
    text: { group: 'inline' }
  }
});

describe('insertViewFence', () => {
  it('inserts the fence and leaves the caret in a paragraph after it', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Intro')])
      ])
    });
    const end = state.doc.content.size - 1;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
    const view = {
      get state() {
        return state;
      },
      dispatch(tr) {
        state = state.apply(tr);
      }
    };

    insertViewFence({ typeId: 'user', name: 'Users' }, view);

    const types = [];
    state.doc.forEach(node => types.push(node.type.name));
    expect(types).toContain('code_block');
    expect(types.at(-1)).toBe('paragraph');
    expect(state.selection.$from.parent.type.name).toBe('paragraph');
    expect(state.selection.$from.parent.content.size).toBe(0);
  });
});
