import { $nodeSchema, $prose, $view } from '@milkdown/utils';
import { NodeSelection, Plugin } from '@milkdown/prose/state';
import { INSTANCE_CHIP_CLASS } from '~/components/shared/chip-surface.js';
import { parseInstanceHref, instanceHref } from '#shared/markdown.js';

// Inline instance references are atomic authoring nodes (SPEC §26): the
// markdown document stores the same `#instance:` link the read pipeline
// renders, while the live editor holds one selectable chip. The node is
// an atom, so a caret never lands inside it and Backspace selects it as
// one unit before deleting.
const NODE_NAME = 'instance_ref';

export function createInstanceRefPlugins({ iconFor = () => '', onOpen = () => {}, onMention = () => {} } = {}) {
  const schema = $nodeSchema(NODE_NAME, () => ({
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    draggable: false,
    attrs: {
      type: { validate: 'string' },
      id: { validate: 'string' },
      label: { default: '' }
    },
    parseDOM: [{
      tag: 'span[data-instance-ref]',
      getAttrs: dom => ({
        type: dom.getAttribute('data-instance-type') || '',
        id: dom.getAttribute('data-instance-id') || '',
        label: dom.getAttribute('data-instance-label') || ''
      })
    }],
    toDOM: node => ['span', {
      'data-instance-ref': '',
      'data-instance-type': node.attrs.type,
      'data-instance-id': node.attrs.id,
      'data-instance-label': node.attrs.label
    }, node.attrs.label],
    parseMarkdown: {
      match: node => node.type === 'link' && Boolean(parseInstanceHref(node.url)),
      runner: (state, node, type) => {
        const ref = parseInstanceHref(node.url);
        const label = (node.children || []).map(child => child.value || '').join('');
        state.addNode(type, { type: ref.type, id: ref.id, label: label || ref.id });
      }
    },
    toMarkdown: {
      match: node => node.type.name === NODE_NAME,
      runner: (state, node) => {
        state.addNode('link', [{
          type: 'text',
          value: node.attrs.label || node.attrs.id
        }], undefined, {
          url: instanceHref(node.attrs.type, node.attrs.id),
          title: null
        });
      }
    }
  }));

  const view = $view(schema.node, () => (node) => {
    const dom = document.createElement('span');
    dom.className = `ck-instance-ref p-chip p-component ${INSTANCE_CHIP_CLASS}`;
    dom.contentEditable = 'false';
    dom.dataset.instanceRef = '';
    dom.setAttribute('role', 'button');

    let current = node;
    const paint = value => {
      dom.dataset.instanceType = value.attrs.type;
      dom.dataset.instanceId = value.attrs.id;
      dom.dataset.instanceLabel = value.attrs.label;
      dom.title = value.attrs.label;
      dom.replaceChildren();
      const icon = document.createElement('i');
      icon.className = `p-chip-icon ${iconFor(value.attrs.type)}`;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'p-chip-label truncate';
      label.textContent = value.attrs.label || value.attrs.id;
      dom.append(icon, label);
    };
    paint(node);
    dom.addEventListener('click', event => {
      event.preventDefault();
      onOpen({ type: current.attrs.type, id: current.attrs.id });
    });

    return {
      dom,
      update: next => {
        if (next.type.name !== NODE_NAME) return false;
        current = next;
        paint(next);
        return true;
      },
      ignoreMutation: () => true
    };
  });

  const behavior = $prose(() => new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '@') return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type.name === 'code_block') return false;
        const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, null, '\ufffc');
        if (before && !/[\s([{>"']/.test(before)) return false;
        onMention(from);
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
        const { selection } = view.state;
        if (!selection.empty) return false;
        const node = event.key === 'Backspace' ? selection.$from.nodeBefore : selection.$from.nodeAfter;
        if (node?.type.name !== NODE_NAME) return false;
        const pos = event.key === 'Backspace'
          ? selection.$from.pos - node.nodeSize
          : selection.$from.pos;
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
        return true;
      }
    }
  }));

  return { schema, view, behavior };
}

export function insertInstanceRef(view, ref) {
  if (!view || !ref?.type || !ref?.id) return;
  const nodeType = view.state.schema.nodes[NODE_NAME];
  if (!nodeType) return;
  const node = nodeType.create({
    type: String(ref.type),
    id: String(ref.id),
    label: String(ref.label || ref.name || ref.id)
  });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}
