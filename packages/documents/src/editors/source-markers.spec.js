import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/prose/model';
import { EditorState, TextSelection } from '@milkdown/prose/state';
import { focusedMarkerDescriptors, selectionState } from './source-markers.js';

// The live-source seam's pure half: marker descriptors and toolbar
// state derive from ProseMirror state alone. The schema mirrors the
// commonmark node/mark names the real editor schema carries.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    blockquote: { content: 'block+', group: 'block' },
    bullet_list: { content: 'list_item+', group: 'block' },
    ordered_list: { content: 'list_item+', group: 'block' },
    list_item: { content: 'block+' },
    text: { group: 'inline' }
  },
  marks: {
    strong: {},
    emphasis: {},
    code_inline: {}
  }
});

function stateFrom(build, cursorAt = null) {
  const doc = build();
  const selection = cursorAt === null ? undefined : TextSelection.create(doc, cursorAt);
  return EditorState.create({ doc, selection });
}

const t = (text, marks = []) => schema.text(text, marks.map(name => schema.marks[name].create()));
const node = (name, attrs, ...content) => schema.nodes[name].createAndFill(attrs, content);

describe('focused block markers', () => {
  it('shows the quote prefix inside a blockquote and nothing for a quoted heading', () => {
    const quoted = stateFrom(
      () => node('doc', null,
        node('blockquote', null, node('paragraph', null, t('Quoted')))),
      3
    );
    expect(focusedMarkerDescriptors(quoted)).toEqual([
      { pos: 2, side: -1, text: '> ' }
    ]);

    const quotedHeading = stateFrom(
      () => node('doc', null,
        node('blockquote', null, node('heading', { level: 2 }, t('Quoted')))),
      3
    );
    expect(focusedMarkerDescriptors(quotedHeading)).toEqual([
      { pos: 2, side: -1, text: '> ' }
    ]);
  });

  it('renders nothing for headings and paragraphs — no marker may reflow the line', () => {
    const heading = stateFrom(
      () => node('doc', null, node('heading', { level: 3 }, t('Title'))),
      3
    );
    expect(focusedMarkerDescriptors(heading)).toEqual([]);

    const marked = stateFrom(
      () => node('doc', null,
        node('paragraph', null, t('plain '), t('bold', ['strong']), t(' tail'))),
      8
    );
    expect(focusedMarkerDescriptors(marked)).toEqual([]);

    const plain = stateFrom(
      () => node('doc', null, node('paragraph', null, t('Plain'))),
      1
    );
    expect(focusedMarkerDescriptors(plain)).toEqual([]);
  });
});

describe('toolbar selection state', () => {
  it('reports block kind, heading level, and containers', () => {
    const heading = stateFrom(
      () => node('doc', null, node('heading', { level: 2 }, t('T'))),
      2
    );
    expect(selectionState(heading)).toMatchObject({ block: 'heading', headingLevel: 2 });

    const listed = stateFrom(
      () => node('doc', null,
        node('bullet_list', null, node('list_item', null, node('paragraph', null, t('item'))))),
      4
    );
    expect(selectionState(listed)).toMatchObject({ block: 'paragraph', bullet: true, ordered: false, quote: false });

    const quoted = stateFrom(
      () => node('doc', null,
        node('blockquote', null, node('paragraph', null, t('q')))),
      3
    );
    expect(selectionState(quoted)).toMatchObject({ block: 'paragraph', quote: true });
  });

  it('reports the marks at the caret', () => {
    const state = stateFrom(
      () => node('doc', null,
        node('paragraph', null, t('code', ['code_inline']), t(' plain'))),
      1
    );
    expect(selectionState(state).marks).toEqual(['code_inline']);
  });
});
