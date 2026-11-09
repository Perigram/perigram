import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/prose/model';
import { EditorState, TextSelection } from '@milkdown/prose/state';
import { insertViewRef } from './view-ref-node.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    view_ref: {
      group: 'block',
      atom: true,
      selectable: true,
      attrs: { typeId: { default: '' }, parentTypeId: { default: '' }, parentId: { default: '' }, sourceId: { default: '' }, name: { default: '' } },
      toDOM: () => ['div', { 'data-view-ref': '' }]
    },
    text: { group: 'inline' }
  }
});

describe('insertViewRef', () => {
  it('inserts the block and leaves the caret in a paragraph after it', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Intro')])])
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)));
    const view = {
      get state() { return state; },
      dispatch(tr) { state = state.apply(tr); }
    };
    insertViewRef({ typeId: 'queue', parentTypeId: 'project', parentId: 'p-1', sourceId: 'queue_children', name: 'Queue' }, view);
    const types = [];
    state.doc.forEach(node => types.push(node.type.name));
    expect(types).toContain('view_ref');
    expect(types.at(-1)).toBe('paragraph');
    expect(state.selection.$from.parent.type.name).toBe('paragraph');
  });
});
