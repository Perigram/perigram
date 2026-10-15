import { Fragment } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

// The live-source seam's editing half (the Obsidian model, SPEC UI):
// the block containing the caret BECOMES its markdown source — the
// focused heading/paragraph swaps into a code block carrying its
// serialized source (a real document transaction: undo, collaborative
// bindings, and the serializer all see it), and leaving the block
// parses the source back through the markdown parser. Serialization is
// dependency-injected (`serialize(node) → string`, `parse(text) → doc
// node`) so the logic runs headless in specs; the editor wires the
// milkdown serializer/parser slices.

export const sourceModeKey = new PluginKey('source-mode');

const SOURCE_ELIGIBLE = ['heading', 'paragraph'];

// Heading source carries its `#` prefix before the content; paragraphs
// serialize bare (the quote marker stays a decoration, not content).
export function sourcePrefixLength(node) {
  if (node.type.name !== 'heading') return 0;
  return '#'.repeat(Number(node.attrs.level) || 1).length + 1;
}

export function createSourceModePlugin({ serialize, parse } = {}) {
  if (typeof serialize !== 'function' || typeof parse !== 'function') return null;
  let composing = false;

  return new Plugin({
    key: sourceModeKey,
    state: {
      init: () => ({ sourceFrom: null }),
      apply(tr, value) {
        const meta = tr.getMeta(sourceModeKey);
        if (meta && 'sourceFrom' in meta) return { sourceFrom: meta.sourceFrom };
        if (value.sourceFrom === null) return value;
        return { sourceFrom: tr.mapping.map(value.sourceFrom, -1) };
      }
    },
    props: {
      // Source-mode keys: Enter at the end of the source commits the
      // block and opens a fresh paragraph below (the authoring beat —
      // type the line, Enter, it renders); Enter elsewhere is a literal
      // source newline; Escape commits in place.
      handleKeyDown(view, event) {
        if (event.key !== 'Enter' && event.key !== 'Escape') return false;
        const state = view.state;
        const { sourceFrom } = sourceModeKey.getState(state);
        if (sourceFrom === null) return false;
        const node = state.doc.nodeAt(sourceFrom);
        if (!node) return false;
        const { from, to, empty } = state.selection;
        if (from <= sourceFrom || to >= sourceFrom + node.nodeSize) return false;
        if (event.key === 'Escape') {
          const tr = commitSource(state.tr, sourceFrom, node);
          const after = TextSelection.near(tr.doc.resolve(tr.mapping.map(sourceFrom + node.nodeSize)), 1);
          tr.setSelection(after);
          view.dispatch(tr.setMeta(sourceModeKey, { sourceFrom: null }));
          return true;
        }
        if (!empty || from !== sourceFrom + node.nodeSize - 1) return false;
        const tr = commitSource(state.tr, sourceFrom, node);
        const insertAt = tr.mapping.map(sourceFrom + node.nodeSize);
        tr.insert(insertAt, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
        view.dispatch(tr.setMeta(sourceModeKey, { sourceFrom: null }));
        return true;
      },
      handleDOMEvents: {
        compositionstart: () => { composing = true; return false; },
        compositionend: () => { composing = false; return false; }
      },
      decorations(state) {
        const { sourceFrom } = sourceModeKey.getState(state);
        if (sourceFrom === null) return DecorationSet.empty;
        const node = state.doc.nodeAt(sourceFrom);
        if (!node) return DecorationSet.empty;
        return DecorationSet.create(state.doc, [
          Decoration.node(sourceFrom, sourceFrom + node.nodeSize, { class: 'md-source-block' })
        ]);
      }
    },
    appendTransaction(transactions, oldState, state) {
      if (transactions.some(tr => tr.getMeta(sourceModeKey))) return null;
      if (composing) return null;

      const { sourceFrom } = sourceModeKey.getState(state);
      const tr = state.tr;
      let swapped = false;

      if (sourceFrom !== null) {
        const node = state.doc.nodeAt(sourceFrom);
        if (node) {
          const inside = state.selection.from > sourceFrom && state.selection.to < sourceFrom + node.nodeSize;
          if (inside) return null;
          // Leaving the source: parse it back. The caret already moved
          // to its destination — the replacement maps the selection
          // along, and the destination is entered below in the same
          // transaction (one beat, no half-rendered step).
          commitSource(tr, sourceFrom, node);
          swapped = true;
        }
      }

      const { doc, selection } = tr;
      if (!selection.empty) {
        return swapped ? tr.setMeta(sourceModeKey, { sourceFrom: null }) : null;
      }
      const $from = doc.resolve(selection.from);
      const parent = $from.parent;
      const eligible = parent.isTextblock && SOURCE_ELIGIBLE.includes(parent.type.name);
      if (!eligible) {
        return swapped ? tr.setMeta(sourceModeKey, { sourceFrom: null }) : null;
      }
      const text = serialize(parent);
      const sourceNode = doc.type.schema.nodes.code_block.createAndFill(null, text ? doc.type.schema.text(text) : undefined);
      if (!sourceNode) {
        return swapped ? tr.setMeta(sourceModeKey, { sourceFrom: null }) : null;
      }
      const from = $from.before();
      tr.replaceWith(from, $from.after(), sourceNode);
      const offset = Math.min(sourcePrefixLength(parent) + $from.parentOffset, text.length);
      tr.setSelection(TextSelection.create(tr.doc, from + 1 + offset));
      return tr.setMeta(sourceModeKey, { sourceFrom: from });
    }
  });

  function commitSource(tr, pos, node) {
    const parsed = parseIntoFragment(tr.doc.type.schema, node.textContent);
    tr.replaceWith(pos, pos + node.nodeSize, parsed);
    return tr;
  }

  function parseIntoFragment(schema, text) {
    if (!text || !text.trim()) return Fragment.fromArray([schema.nodes.paragraph.create()]);
    const parsed = parse(text);
    const content = parsed?.content;
    if (!content || !content.size) return Fragment.fromArray([schema.nodes.paragraph.create()]);
    return content;
  }
}
