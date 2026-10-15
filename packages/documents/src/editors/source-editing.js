// View-level source editing — the Obsidian model over a semantic
// document (SPEC UI). The focused block shows and edits its markdown
// source in an overlay that belongs to the VIEW: the document keeps
// its real nodes at all times, so saves, undo, other panes, and a
// future CRDT binding never see representation swaps. A node view
// renders the block's normal content until the selection enters it,
// then hides the rendered content and surfaces a plaintext overlay
// seeded with the block's serialized markdown; leaving the block (or
// committing with Enter/Escape/save-flush) parses the source back in
// ONE transaction. Serialization is dependency-injected
// (`serialize(node) → string`, `parse(text) → doc node`); `onInput`
// feeds dirty tracking (overlay typing makes no transactions) and
// `onActive` gates the toolbar while raw source is being edited.

import { Fragment } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';

export function createSourceEditingView({ serialize, parse, onInput = null, onActive = null } = {}) {
  if (typeof serialize !== 'function' || typeof parse !== 'function') return null;
  return (node, view, getPos) => {
    let dom = document.createElement(tagNameFor(node));
    dom.classList.add('md-live-block');
    const contentDOM = document.createElement('span');
    contentDOM.className = 'md-live-rendered';
    dom.appendChild(contentDOM);
    const overlay = document.createElement('span');
    overlay.className = 'md-live-source';
    overlay.contentEditable = 'plaintext-only';
    overlay.spellcheck = true;
    dom.appendChild(overlay);
    let active = false;

    function tagNameFor(n) {
      return n.type.name === 'heading' ? `h${Number(n.attrs.level) || 1}` : 'p';
    }

    function pos() {
      return typeof getPos === 'function' ? getPos() : null;
    }

    function selectionInside() {
      const at = pos();
      if (at == null) return false;
      const { from, to } = view.state.selection;
      return from > at && to < at + node.nodeSize;
    }

    function enter() {
      active = true;
      dom.classList.add('is-source');
      overlay.textContent = serialize(node);
      // Park the editor selection inside the block so the toolbar and
      // the rest of the app agree about the focus; typing itself lives
      // in the overlay and reports through onInput.
      const at = pos();
      if (at != null) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + 1)).setMeta('sourceEditing', true));
      }
      const caret = Math.min(prefixLength(node) + renderedCaretOffset(contentDOM), overlay.textContent.length);
      overlay.focus();
      setCaret(overlay, caret);
      onActive?.(true);
    }

    function commit({ selectAfter = null } = {}) {
      if (!active) return;
      active = false;
      const at = pos();
      if (at == null) return;
      const fragment = parseFragment(view.state.schema, overlay.textContent, parse);
      const end = at + node.nodeSize;
      const tr = view.state.tr.replaceWith(at, end, fragment);
      const anchor = Math.min(selectAfter ?? view.state.selection.from, tr.doc.content.size);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, anchor))));
      view.dispatch(tr.setMeta('sourceEditing', true));
      dom.classList.remove('is-source');
      onActive?.(false);
    }

    // Enter at the source end commits the block and opens a fresh
    // source line below (the authoring beat); Enter elsewhere is a
    // literal newline — multi-line markdown is authored in source.
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        const at = pos();
        commit({ selectAfter: at == null ? null : at + node.nodeSize + 1 });
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      const text = overlay.textContent;
      const caret = caretOffset(overlay);
      if (caret < text.length || text.length === 0) return; // literal newline
      event.preventDefault();
      const at = pos();
      const fragment = parseFragment(view.state.schema, text, parse);
      const tr = view.state.tr.replaceWith(at, at + node.nodeSize, fragment);
      const fresh = view.state.schema.nodes.paragraph.create();
      tr.insert(tr.mapping.map(at + fragment.size), fresh);
      const next = tr.mapping.map(at + fragment.size) + 1;
      tr.setSelection(TextSelection.create(tr.doc, next));
      view.dispatch(tr.setMeta('sourceEditing', true));
      active = false;
      dom.classList.remove('is-source');
      onActive?.(false);
    });

    overlay.addEventListener('input', () => onInput?.());

    const onSelectionChange = () => {
      if (active && !selectionInside()) commit();
      else if (!active && selectionInside() && view.hasFocus()) enter();
    };
    document.addEventListener('selectionchange', onSelectionChange);

    return {
      dom,
      contentDOM,
      update(newNode) {
        if (newNode.type !== node.type) return false;
        node = newNode;
        const tag = tagNameFor(node);
        if (dom.tagName !== tag.toUpperCase()) {
          const next = document.createElement(tag);
          next.className = dom.className;
          next.append(...dom.childNodes);
          dom.replaceWith(next);
          dom = next;
        }
        return true; // PM keeps contentDOM in sync while rendered
      },
      ignoreMutation(mutation) {
        return active || mutation.target === overlay; // overlay edits are ours
      },
      destroy() {
        document.removeEventListener('selectionchange', onSelectionChange);
      }
    };
  };
}

function prefixLength(node) {
  if (node.type.name !== 'heading') return 0;
  return '#'.repeat(Number(node.attrs.level) || 1).length + 1;
}

function parseFragment(schema, text, parse) {
  if (!text || !text.trim()) return Fragment.fromArray([schema.nodes.paragraph.create()]);
  const content = parse(text)?.content;
  if (!content || !content.size) return Fragment.fromArray([schema.nodes.paragraph.create()]);
  return content;
}

// Caret mapping between the rendered content and the source text is
// approximate (inline markers change lengths); the prefix is exact.
function renderedCaretOffset(contentDOM) {
  const selection = window.getSelection();
  if (!selection || !contentDOM.contains(selection.anchorNode)) return 0;
  let offset = 0;
  let seen = false;
  const walk = (node) => {
    if (node === selection.anchorNode) {
      offset += selection.anchorOffset;
      seen = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) offset += node.textContent.length;
    else for (const child of node.childNodes) walk(child);
  };
  walk(contentDOM);
  return seen ? offset : 0;
}

function caretOffset(editable) {
  const selection = window.getSelection();
  if (!selection || !editable.contains(selection.anchorNode)) return editable.textContent.length;
  let offset = 0;
  const walk = (node) => {
    if (node === selection.anchorNode) {
      offset += selection.anchorOffset;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) offset += node.textContent.length;
    else for (const child of node.childNodes) if (walk(child)) return true;
    return false;
  };
  walk(editable);
  return offset;
}

function setCaret(editable, offset) {
  const selection = window.getSelection();
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const walk = (node) => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (remaining <= node.textContent.length) {
        range.setStart(node, remaining);
        placed = true;
        return;
      }
      remaining -= node.textContent.length;
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(editable);
  if (!placed) range.setStart(editable, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
