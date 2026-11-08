import { h, render } from 'vue';
import { $nodeSchema, $prose, $view } from '@milkdown/utils';
import { NodeSelection, Plugin } from '@milkdown/prose/state';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { parseInstanceHref, instanceHref } from '#shared/markdown.js';

// Inline instance references are atomic authoring nodes (SPEC §26): the
// markdown document stores the same `#instance:` link the read pipeline
// renders, while the live editor holds one selectable chip. The node is
// an atom, so a caret never lands inside it and Backspace selects it as
// one unit before deleting.
const NODE_NAME = 'instance_ref';

export function createInstanceRefPlugins({ appContext = null, onMention = () => {} } = {}) {
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
    dom.className = 'ck-instance-ref';
    dom.contentEditable = 'false';
    dom.dataset.instanceRef = '';

    let unmount = null;
    const paint = value => {
      dom.dataset.instanceType = value.attrs.type;
      dom.dataset.instanceId = value.attrs.id;
      dom.dataset.instanceLabel = value.attrs.label;
      unmount?.();
      const vnode = h(InstanceInlineRef, {
        type: value.attrs.type,
        id: value.attrs.id
      });
      vnode.appContext = appContext;
      render(vnode, dom);
      unmount = () => render(null, dom);
    };
    paint(node);

    return {
      dom,
      update: next => {
        if (next.type.name !== NODE_NAME) return false;
        paint(next);
        return true;
      },
      ignoreMutation: () => true,
      destroy: () => unmount?.()
    };
  });

  const behavior = $prose(() => new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '@') return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type.name === 'code_block') return false;
        const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, null, ' ');
        if (before && !/[\s([{>"']/.test(before)) return false;
        onMention(from);
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
        const { selection } = view.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if (event.key === 'Backspace') {
          const before = $from.nodeBefore;
          if (before?.type.name === NODE_NAME) {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(
              view.state.doc,
              $from.pos - before.nodeSize
            )));
            return true;
          }
          if (before?.isText && before.text.endsWith(' ')) {
            const spacerStart = $from.pos - before.nodeSize;
            const node = view.state.doc.resolve(spacerStart).nodeBefore;
            if (node?.type.name === NODE_NAME) {
              const tr = view.state.tr.delete($from.pos - 1, $from.pos);
              tr.setSelection(NodeSelection.create(tr.doc, spacerStart - node.nodeSize));
              view.dispatch(tr);
              return true;
            }
          }
        }
        if (event.key === 'Delete') {
          const after = $from.nodeAfter;
          if (after?.type.name === NODE_NAME) {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, $from.pos)));
            return true;
          }
        }
        return false;
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
  const tr = view.state.tr.replaceSelectionWith(node);
  tr.insertText(' ');
  view.dispatch(tr.scrollIntoView());
}
