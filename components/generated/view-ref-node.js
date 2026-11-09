import { h, render } from 'vue';
import { $nodeSchema, $remark, $view } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import ViewEmbed from '~/components/generated/ViewEmbed.vue';
import { parseViewRef } from '#shared/markdown.js';

// Collection embeds are atomic block nodes (SPEC §26): the markdown
// document stores the same `view` fence the read pipeline consumes,
// while the editor holds one selectable live collection block.
const NODE_NAME = 'view_ref';
const MDAST_NAME = 'viewFence';

const remarkViewFence = $remark('remarkViewFence', () => () => tree => {
  const walk = node => {
    if (!Array.isArray(node?.children)) return;
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      if (child.type === 'code' && String(child.lang || '').trim() === 'view') {
        const ref = parseViewRef(child.value);
        if (ref) {
          node.children[index] = { type: MDAST_NAME, value: child.value, data: { ref } };
          continue;
        }
      }
      walk(child);
    }
  };
  walk(tree);
});

function attrsFromRef(ref = {}) {
  return {
    id: String(ref.id || ''),
    typeId: String(ref.typeId || ''),
    name: String(ref.name || ''),
    parentTypeId: String(ref.parentTypeId || ''),
    parentId: String(ref.parentId || ''),
    sourceId: String(ref.sourceId || '')
  };
}

function refFromAttrs(attrs = {}) {
  return {
    ...(attrs.id ? { id: String(attrs.id) } : {}),
    typeId: String(attrs.typeId || ''),
    ...(attrs.parentTypeId ? { parentTypeId: String(attrs.parentTypeId) } : {}),
    ...(attrs.parentId ? { parentId: String(attrs.parentId) } : {}),
    ...(attrs.sourceId ? { sourceId: String(attrs.sourceId) } : {}),
    name: String(attrs.name || '')
  };
}

export function createViewRefPlugins({ appContext = null } = {}) {
  const schema = $nodeSchema(NODE_NAME, () => ({
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,
    defining: true,
    attrs: {
      id: { default: '' },
      typeId: { default: '' },
      name: { default: '' },
      parentTypeId: { default: '' },
      parentId: { default: '' },
      sourceId: { default: '' }
    },
    parseDOM: [{
      tag: 'div[data-view-ref]',
      getAttrs: dom => {
        try {
          return attrsFromRef(JSON.parse(dom.getAttribute('data-view-ref') || '{}'));
        } catch {
          return false;
        }
      }
    }],
    toDOM: node => ['div', { 'data-view-ref': JSON.stringify(refFromAttrs(node.attrs)) }],
    parseMarkdown: {
      match: node => node.type === MDAST_NAME,
      runner: (state, node, type) => {
        state.addNode(type, attrsFromRef(parseViewRef(node.value)));
      }
    },
    toMarkdown: {
      match: node => node.type.name === NODE_NAME,
      runner: (state, node) => {
        state.addNode('code', undefined, JSON.stringify(refFromAttrs(node.attrs)), { lang: 'view' });
      }
    }
  }));

  const view = $view(schema.node, () => node => {
    const dom = document.createElement('div');
    dom.className = 'ck-live-view';
    dom.contentEditable = 'false';

    let unmount = null;
    const paint = value => {
      unmount?.();
      const vnode = h(ViewEmbed, {
        viewId: value.attrs.id || '',
        typeId: value.attrs.typeId || '',
        parentTypeId: value.attrs.parentTypeId || '',
        parentId: value.attrs.parentId || '',
        sourceId: value.attrs.sourceId || '',
        fallbackName: value.attrs.name || ''
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

  return { remark: remarkViewFence, schema, view };
}

export function insertViewRef(ref, view) {
  if ((!ref?.id && !ref?.typeId) || !view) return;
  const nodeType = view.state.schema.nodes[NODE_NAME];
  const paragraph = view.state.schema.nodes.paragraph;
  if (!nodeType) return;
  const node = nodeType.create(attrsFromRef(ref));
  const tr = view.state.tr.replaceSelectionWith(node);
  let after = null;
  tr.doc.forEach((child, offset) => {
    if (child === node) after = offset + child.nodeSize;
  });
  if (after === null) return;
  tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1), 1));
  view.dispatch(tr.scrollIntoView());
}
