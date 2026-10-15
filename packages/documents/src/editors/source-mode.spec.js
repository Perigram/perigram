import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/prose/model';
import { EditorState, TextSelection } from '@milkdown/prose/state';
import { createSourceModePlugin, sourceModeKey } from './source-mode.js';

// The source-mode contract, headless: the focused heading/paragraph
// becomes its serialized markdown (a real transaction), leaving parses
// the source back, and Enter at the source end commits the block and
// opens a fresh paragraph. Serialization is injected, so the fakes
// mirror just enough markdown (heading prefix, ** marks).

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    code_block: { content: 'text*', group: 'block', code: true },
    text: { group: 'inline' }
  },
  marks: { strong: {} }
});

const serialize = node => {
  const inline = block => {
    let out = '';
    block.forEach(child => {
      out += child.marks.some(mark => mark.type.name === 'strong') ? `**${child.text}**` : child.text;
    });
    return out;
  };
  if (node.type.name === 'heading') return `${'#'.repeat(Number(node.attrs.level) || 1)} ${inline(node)}`;
  return inline(node);
};

const parse = text => {
  const blocks = String(text).split('\n').map(line => {
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    const body = heading ? heading[2] : line;
    const parts = [];
    let last = 0;
    let match;
    const re = /\*\*([^*]+)\*\*/g;
    while ((match = re.exec(body))) {
      if (match.index > last) parts.push(schema.text(body.slice(last, match.index)));
      parts.push(schema.text(match[1], [schema.marks.strong.create()]));
      last = match.index + match[0].length;
    }
    if (last < body.length) parts.push(schema.text(body.slice(last)));
    return heading
      ? schema.nodes.heading.create({ level: heading[1].length }, parts)
      : schema.nodes.paragraph.create(null, parts);
  });
  return schema.nodes.doc.create(null, blocks);
};

const t = text => schema.text(text);
const node = (name, attrs, ...content) => schema.nodes[name].createAndFill(attrs, content);

function stateWith(doc, at, plugin) {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, at),
    plugins: [plugin]
  });
}

// Drives one dispatched transaction through the plugin exactly as the
// editor view does: apply, then run appendTransaction.
function dispatch(state, tr, plugin) {
  const next = state.apply(tr);
  const follow = plugin.spec.appendTransaction([tr], state, next);
  return follow ? next.apply(follow) : next;
}

const keyView = plugin => {
  let state = null;
  return {
    get state() { return state; },
    start(at) { state = at; return this; },
    dispatch(tr) { state = state.apply(tr); }
  };
};

describe('source mode', () => {
  const plugin = createSourceModePlugin({ serialize, parse });

  function enter(doc, at) {
    const state = EditorState.create({ doc, plugins: [plugin] });
    return dispatch(state, state.tr.setSelection(TextSelection.create(state.doc, at)), plugin);
  }

  it('turns the entered heading into its markdown source', () => {
    const doc = node('doc', null, node('heading', { level: 2 }, t('Title')));
    const state = enter(doc, 3);
    expect(state.doc.firstChild.type.name).toBe('code_block');
    expect(state.doc.firstChild.textContent).toBe('## Title');
    expect(sourceModeKey.getState(state).sourceFrom).toBe(0);
    expect(state.selection.from).toBeGreaterThan(0);
  });

  it('keeps marks as literal source inside the entered paragraph', () => {
    const doc = node('doc', null,
      node('paragraph', null, t('plain '), schema.text('bold', [schema.marks.strong.create()])));
    const state = enter(doc, 1);
    expect(state.doc.firstChild.textContent).toBe('plain **bold**');
  });

  it('parses the source back and enters the destination in one beat', () => {
    const state = enter(
      node('doc', null, node('heading', { level: 1 }, t('Title')), node('paragraph', null, t('Body'))),
      3
    );
    // Caret from the heading source into the body paragraph.
    const moved = dispatch(state, state.tr.setSelection(TextSelection.near(state.doc.resolve(9))), plugin);
    const [first, second] = [moved.doc.child(0), moved.doc.child(1)];
    expect(first.type.name).toBe('heading');
    expect(first.textContent).toBe('Title');
    expect(second.type.name).toBe('code_block');
    expect(second.textContent).toBe('Body');
  });

  it('Enter at the source end commits the block and opens a fresh paragraph', () => {
    const state = enter(node('doc', null, node('heading', { level: 1 }, t('Title'))), 3);
    const view = keyView(plugin).start(state);
    const source = state.doc.firstChild;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, source.nodeSize - 1)));
    const handled = plugin.props.handleKeyDown(view, { key: 'Enter' }) || false;
    expect(handled).toBe(true);
    const after = view.state.doc;
    expect(after.child(0).type.name).toBe('heading');
    expect(after.childCount).toBe(2);
    expect(after.child(1).type.name).toBe('paragraph');
    expect(sourceModeKey.getState(view.state).sourceFrom).toBeNull();
  });

  it('Enter mid-source stays a literal newline', () => {
    const state = enter(node('doc', null, node('paragraph', null, t('two lines'))), 1);
    const view = keyView(plugin).start(state);
    expect(plugin.props.handleKeyDown(view, { key: 'Enter' })).toBeFalsy();
  });

  it('Escape commits the source in place', () => {
    const state = enter(node('doc', null, node('heading', { level: 3 }, t('Deep'))), 3);
    const view = keyView(plugin).start(state);
    expect(plugin.props.handleKeyDown(view, { key: 'Escape' })).toBe(true);
    const after = view.state.doc;
    expect(after.child(0).type.name).toBe('heading');
    expect(after.child(0).attrs.level).toBe(3);
    expect(sourceModeKey.getState(view.state).sourceFrom).toBeNull();
  });

  it('does not enter code blocks or non-textblock positions', () => {
    const doc = node('doc', null, node('code_block', null, t('const x = 1;')), node('paragraph', null, t('text')));
    const state = enter(doc, 1);
    expect(state.doc.child(0).type.name).toBe('code_block');
    expect(state.doc.child(1).type.name).toBe('paragraph');
    expect(sourceModeKey.getState(state).sourceFrom).toBeNull();
  });
});
