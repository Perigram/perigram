import { h, render } from 'vue';
import { $nodeSchema, $view } from '@milkdown/utils';
import FileChip from '~/components/shared/FileChip.vue';
import { fileHref, parseFileHref } from '#shared/markdown.js';
import { fileRefDescriptor } from '~/utils/file-refs.js';

const NODE_NAME = 'file_ref';

export function createFileRefPlugins({ appContext = null } = {}) {
  const schema = $nodeSchema(NODE_NAME, () => ({
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    draggable: false,
    attrs: {
      href: { validate: 'string' },
      label: { default: '' }
    },
    parseDOM: [{
      tag: 'span[data-file-ref]',
      getAttrs: dom => ({
        href: dom.getAttribute('data-file-href') || '',
        label: dom.getAttribute('data-file-label') || ''
      })
    }],
    toDOM: node => ['span', {
      'data-file-ref': '',
      'data-file-href': node.attrs.href,
      'data-file-label': node.attrs.label
    }, node.attrs.label],
    parseMarkdown: {
      match: node => node.type === 'link' && Boolean(parseFileHref(node.url)),
      runner: (state, node, type) => {
        const ref = parseFileHref(node.url);
        const label = (node.children || []).map(child => child.value || '').join('');
        state.addNode(type, { href: ref.href, label: label || ref.href });
      }
    },
    toMarkdown: {
      match: node => node.type.name === NODE_NAME,
      runner: (state, node) => {
        state.addNode('link', [{
          type: 'text',
          value: node.attrs.label || node.attrs.href
        }], undefined, {
          url: fileHref(node.attrs.href),
          title: null
        });
      }
    }
  }));

  const view = $view(schema.node, () => (node) => {
    const dom = document.createElement('span');
    dom.className = 'ck-file-ref';
    dom.contentEditable = 'false';
    dom.dataset.fileRef = '';

    let unmount = null;
    const paint = value => {
      dom.dataset.fileHref = value.attrs.href;
      dom.dataset.fileLabel = value.attrs.label;
      unmount?.();
      const href = value.attrs.href;
      const vnode = h(FileChip, {
        file: fileRefDescriptor({ href, name: value.attrs.label }),
        onOpen: () => {
          if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener');
        }
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

  return { schema, view };
}

export function insertFileRef(view, ref) {
  if (!view || !ref?.href) return;
  const nodeType = view.state.schema.nodes[NODE_NAME];
  if (!nodeType) return;
  const node = nodeType.create({
    href: String(ref.href),
    label: String(ref.name || ref.label || ref.href)
  });
  const tr = view.state.tr.replaceSelectionWith(node);
  tr.insertText(' ');
  view.dispatch(tr.scrollIntoView());
}
