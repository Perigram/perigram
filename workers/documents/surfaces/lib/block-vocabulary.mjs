// The one block-authoring vocabulary (SPEC §26): every markdown
// authoring surface — the text editor, the custom-page and
// instance-block surfaces — offers this table through the slash panel
// and applies it through `applyBlock`. Entries toggle: the entry
// matching the focused block's kind returns the block to body text.
// The view entry hands off to the host's saved-view picker.
import { callCommand } from '@milkdown/utils';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import {
  wrapInHeadingCommand, turnIntoTextCommand, wrapInBulletListCommand,
  wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand,
  insertHrCommand, insertImageCommand, liftListItemCommand
} from '@milkdown/preset-commonmark';
import { lift } from '@milkdown/prose/commands';
import { BLOCK_VOCABULARY } from './block-vocabulary-data.mjs';

export { BLOCK_VOCABULARY };

export function blockIsActive(id, state) {
  if (!state) return false;
  switch (id) {
    case 'paragraph': return state.block === 'paragraph' && !state.bullet && !state.ordered && !state.quote;
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return state.block === 'heading' && state.headingLevel === Number(id.slice(1));
    case 'bullet': return state.bullet;
    case 'ordered': return state.ordered;
    case 'todo': return state.task;
    case 'quote': return state.quote;
    case 'callout': return state.quote;
    case 'codeblock': return state.block === 'code_block';
    default: return false;
  }
}

// The action an entry resolves to against the focused block: a milkdown
// command (with optional payload), the raw prose lift for the quote, a
// task-checkbox mutation, or a node insertion / host hand-off.
export function resolveBlockAction(id, state) {
  const active = blockIsActive(id, state);
  switch (id) {
    case 'paragraph': return { kind: 'command', command: turnIntoTextCommand };
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return active
        ? { kind: 'command', command: turnIntoTextCommand }
        : { kind: 'command', command: wrapInHeadingCommand, payload: Number(id.slice(1)) };
    case 'bullet':
      return active
        ? { kind: 'command', command: liftListItemCommand }
        : { kind: 'command', command: wrapInBulletListCommand };
    case 'ordered':
      return active
        ? { kind: 'command', command: liftListItemCommand }
        : { kind: 'command', command: wrapInOrderedListCommand };
    case 'quote': return active ? { kind: 'lift' } : { kind: 'command', command: wrapInBlockquoteCommand };
    case 'codeblock':
      return active
        ? { kind: 'command', command: turnIntoTextCommand }
        : { kind: 'command', command: createCodeBlockCommand };
    case 'todo': return { kind: 'task', checked: active ? null : false, wrap: !(state && (state.bullet || state.ordered)) };
    case 'callout': return active ? { kind: 'lift' } : { kind: 'callout' };
    case 'divider': return { kind: 'command', command: insertHrCommand };
    case 'image': return { kind: 'image' };
    case 'file': return { kind: 'file' };
    case 'diagram': return { kind: 'command', command: createCodeBlockCommand, payload: 'mermaid' };
    case 'table': return { kind: 'table' };
    case 'link': return { kind: 'link' };
    case 'instance': return { kind: 'instance' };
    case 'view': return { kind: 'view' };
    default: return null;
  }
}

// Applies a vocabulary entry at the caret: dispatches the resolved
// action through the bound engine (`editor` is the crepe instance,
// `view` its ProseMirror view). The `link` and `image` kinds hand off
// to the host's address editor. Returns the action kind — a hand-off
// kind leaves the focus with the host's address input.
export function applyBlock({ id, state, editor, view, openLinkEditor, openImageEditor, openFilePicker, openInstancePicker, openViewPicker, insertView }) {
  const action = resolveBlockAction(id, state);
  if (!action || !editor) return action ? action.kind : null;
  switch (action.kind) {
    case 'command':
      editor.editor.action(callCommand(action.command.key, action.payload));
      break;
    case 'lift':
      // Blockquotes carry no preset unwrap: lift the focused block out
      // through the raw prose command.
      editor.editor.action(ctx => {
        const prose = ctx.get(editorViewCtx);
        lift(prose.state, prose.dispatch, prose);
      });
      break;
    case 'task': {
      if (action.wrap) editor.editor.action(callCommand(wrapInBulletListCommand.key));
      const item = focusedListItem(view.state);
      if (item) {
        view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked: action.checked }));
      }
      break;
    }
    case 'callout': {
      const { blockquote, paragraph } = view.state.schema.nodes;
      view.dispatch(view.state.tr.replaceSelectionWith(blockquote.createChecked(null, paragraph.create())).scrollIntoView());
      break;
    }
    case 'table':
      insertTable(view);
      break;
    case 'link':
      openLinkEditor();
      break;
    case 'image':
      if (openImageEditor) openImageEditor();
      break;
    case 'file':
      if (openFilePicker) openFilePicker();
      break;
    case 'instance':
      if (openInstancePicker) openInstancePicker(ref => insertInstanceLink(ref, view));
      break;
    case 'view':
      // The host resolves the picked saved view; the fence it inserts
      // carries the view ref (`{ id, name }`, the deleted-view name).
      if (openViewPicker) openViewPicker(ref => (insertView || insertViewFence)(ref, view));
      break;
    default:
      break;
  }
  return action.kind;
}

export function insertInstanceLink(ref, view) {
  if (!ref?.type || !ref?.id || !view) return;
  const href = `#instance:${encodeURIComponent(String(ref.type))}/${encodeURIComponent(String(ref.id))}`;
  const label = String(ref.label || ref.name || ref.id);
  const link = view.state.schema.marks.link;
  const from = view.state.selection.from;
  const tr = view.state.tr.insertText(label);
  tr.addMark(from, from + label.length, link.create({ href }));
  view.dispatch(tr.scrollIntoView());
}

export function insertViewFence(ref, view) {
  if ((!ref?.id && !ref?.typeId) || !view) return;
  const { code_block, paragraph } = view.state.schema.nodes;
  const target = {
    ...(ref.id ? { id: String(ref.id) } : {}),
    typeId: String(ref.typeId || ''),
    name: String(ref.name || ''),
    ...(ref.parentTypeId ? { parentTypeId: String(ref.parentTypeId) } : {}),
    ...(ref.parentId ? { parentId: String(ref.parentId) } : {}),
    ...(ref.sourceId ? { sourceId: String(ref.sourceId) } : {})
  };
  const body = view.state.schema.text(JSON.stringify(target));
  const fence = code_block.createChecked({ language: 'view' }, body);
  const from = view.state.selection.from;
  const tr = view.state.tr.replaceSelectionWith(fence);
  const after = tr.mapping.map(from, -1) + fence.nodeSize;
  tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1), 1));
  view.dispatch(tr.scrollIntoView());
}

function focusedListItem(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'list_item') return { pos: $from.before(depth), node };
  }
  return null;
}

// A three-by-three table node over the gfm schema: the header row is its
// own row type with header cells; body rows carry body cells.
function insertTable(view) {
  const { table, table_header_row, table_row, table_header, table_cell, paragraph } = view.state.schema.nodes;
  const header = table_header_row.createChecked(null, Array.from({ length: 3 }, () => table_header.createChecked(null, paragraph.create())));
  const body = () => table_row.createChecked(null, Array.from({ length: 3 }, () => table_cell.createChecked(null, paragraph.create())));
  const node = table.createChecked(null, [header, body(), body()]);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}
