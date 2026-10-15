import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { applySourceFormat, sourceSelectionState } from './source-commands.js';

// The source-mode half of the toolbar: the same controls act on
// markdown text — inline marks wrap or unwrap the selection, block
// controls set or lift the line prefix. Pure `(state) -> transaction`
// commands, exercised headless like the prose commands they mirror.

function run(doc, anchor, head = anchor, control, options = {}) {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const spec = applySourceFormat(control, options)(state);
  return spec ? state.update(spec).state : state;
}

const control = id => ({ id });

describe('source inline marks', () => {
  it('wraps the selection and unwraps it again', () => {
    const wrapped = run('plain text', 6, 10, control('strong'));
    expect(wrapped.doc.toString()).toBe('plain **text**');
    const unwrapped = run('plain **text**', 8, 12, control('strong'));
    expect(unwrapped.doc.toString()).toBe('plain text');
  });

  it('unwraps a selection that carries its own markers', () => {
    const state = run('a **bold** b', 2, 10, control('strong'));
    expect(state.doc.toString()).toBe('a bold b');
  });

  it('plants an empty marker pair at the caret', () => {
    const state = run('word', 2, 2, control('code'));
    expect(state.doc.toString()).toBe('wo``rd');
    expect(state.selection.main.head).toBe(3);
  });

  it('inserts a markdown link over the selection', () => {
    const state = run('see this', 4, 8, control('link'), { href: 'https://example.com' });
    expect(state.doc.toString()).toBe('see [this](https://example.com)');
  });
});

describe('source block prefixes', () => {
  it('sets a heading and lifts it again', () => {
    const heading = run('Title', 0, 0, control('h2'));
    expect(heading.doc.toString()).toBe('## Title');
    const lifted = run('## Title', 0, 0, control('h2'));
    expect(lifted.doc.toString()).toBe('Title');
  });

  it('replaces one block prefix with another and clears to paragraph', () => {
    const bulleted = run('## Title', 0, 0, control('bullet'));
    expect(bulleted.doc.toString()).toBe('- Title');
    const cleared = run('- Title', 0, 0, control('paragraph'));
    expect(cleared.doc.toString()).toBe('Title');
  });

  it('numbers an ordered list across the selected lines', () => {
    const state = run('a\nb', 0, 3, control('ordered'));
    expect(state.doc.toString()).toBe('1. a\n2. b');
    const lifted = run('1. a\n2. b', 0, 7, control('ordered'));
    expect(lifted.doc.toString()).toBe('a\nb');
  });
});

describe('source fences', () => {
  it('wraps the selection in fences and lifts them again', () => {
    const fenced = run('code here', 0, 0, control('codeblock'));
    expect(fenced.doc.toString()).toBe('```\ncode here\n```');
    const lifted = EditorState.create({ doc: '```\ncode here\n```', selection: { anchor: 8 } });
    const spec = applySourceFormat(control('codeblock'))(lifted);
    expect(spec ? lifted.update(spec).state.doc.toString() : '').toBe('code here');
  });
});

describe('source selection state', () => {
  it('reports the cursor line\'s block and the selection\'s wraps', () => {
    const heading = sourceSelectionState(EditorState.create({ doc: '### Title', selection: { anchor: 5 } }));
    expect(heading).toMatchObject({ block: 'heading', headingLevel: 3 });

    const quoted = sourceSelectionState(EditorState.create({ doc: '> word', selection: { anchor: 3 } }));
    expect(quoted).toMatchObject({ block: 'paragraph', quote: true, marks: [] });

    const marked = sourceSelectionState(EditorState.create({ doc: 'a **bold** b', selection: { anchor: 4, head: 8 } }));
    expect(marked.marks).toEqual(['strong']);

    const fenced = sourceSelectionState(EditorState.create({ doc: '```\nx = 1\n```', selection: { anchor: 8 } }));
    expect(fenced).toMatchObject({ block: 'code_block' });
  });
});
