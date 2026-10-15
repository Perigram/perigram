// The slash command menu: typing `/` at a word start opens the block
// vocabulary beside the caret. The engine half is the official
// @milkdown/plugin-slash (input tracking + floating-ui positioning);
// this module owns the menu DOM, query filtering, and keyboard
// navigation. Picking an item deletes the `/query` text and hands the
// id to the host editor, which runs the same command path the toolbar
// uses.
import { Plugin } from '@milkdown/prose/state';
import { SlashProvider } from '@milkdown/plugin-slash';

// The `/query` word at the caret, or null when the caret does not sit
// in one.
export function slashQuery(text) {
  if (!text) return null;
  const match = /(?:^|\s)\/([^/\s]*)$/.exec(text);
  return match ? match[1] : null;
}

export function createSlashMenu({ items, onPick }) {
  const element = document.createElement('div');
  // Host UI, host chrome: the menu composes from the app's overlay
  // vocabulary (bg-content, shadow-overlay — the same surface the
  // designer panels and floating windows use), and the module's
  // stylesheet owns only position/visibility mechanics.
  element.className = 'md-slash-menu p-1 min-w-48 max-h-72 overflow-y-auto rounded-ui border border-content-border bg-content shadow-overlay';
  element.dataset.show = 'false';

  let view = null;
  let filtered = [];
  let active = 0;

  const provider = new SlashProvider({
    content: element,
    debounce: 0,
    // The menu is host UI, not part of the document engine: appended to
    // the page root (crepe's reset governs everything inside .milkdown
    // — `.milkdown *` zeroes padding and `.milkdown button` strips
    // backgrounds, so a menu mounted there loses the host utilities).
    root: document.body,
    floatingUIOptions: { strategy: 'fixed' },
    shouldShow: current => slashQuery(provider.getContent(current)) !== null
  });

  function render() {
    element.replaceChildren(...filtered.map((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `md-slash-item w-full text-left px-2.5 py-1 rounded-ui text-body text-chrome-foreground hover:bg-chrome-subtle${index === active ? ' bg-chrome-subtle' : ''}`;
      button.textContent = item.label;
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => pick(index));
      return button;
    }));
  }

  function pick(index) {
    const item = filtered[index];
    if (!item || !view) return;
    const query = slashQuery(provider.getContent(view)) ?? '';
    const to = view.state.selection.to;
    hide();
    view.dispatch(view.state.tr.delete(Math.max(0, to - query.length - 1), to));
    onPick(item.id, view);
    view.focus();
  }

  function hide() {
    element.dataset.show = 'false';
    provider.hide();
  }

  function sync() {
    if (!view || view.composing || !view.hasFocus()) return hide();
    const query = slashQuery(provider.getContent(view));
    if (query === null) return hide();
    const needle = query.toLowerCase();
    filtered = items.filter(item => item.match.some(term => term.startsWith(needle)));
    if (!filtered.length) return hide();
    active = Math.min(active, filtered.length - 1);
    render();
    element.dataset.show = 'true';
    provider.show();
  }

  const plugin = new Plugin({
    view(editorView) {
      view = editorView;
      return { update() { provider.update(view); sync(); } };
    },
    props: {
      handleKeyDown(editorView, event) {
        if (element.dataset.show !== 'true') return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          active = (active + (event.key === 'ArrowDown' ? 1 : filtered.length - 1)) % filtered.length;
          render();
          return true;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          pick(active);
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          hide();
          return true;
        }
        return false;
      }
    }
  });

  return { plugin, element, destroy: () => { provider.destroy(); element.remove(); } };
}
