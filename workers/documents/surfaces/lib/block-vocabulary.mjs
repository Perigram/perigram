// The one block-authoring vocabulary (SPEC §26): every markdown
// authoring surface — the text editor, the custom-page and
// instance-block surfaces — offers this table through the slash panel
// and applies it through `applyBlock`. Entries toggle: the entry
// matching the focused block's kind returns the block to body text.
// The view entry hands off to the host's saved-view picker.
import { callCommand } from '@milkdown/utils';
import { editorViewCtx } from '@milkdown/core';
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
    case 'diagram': return { kind: 'command', command: createCodeBlockCommand, payload: 'mermaid' };
    case 'table': return { kind: 'table' };
    case 'link': return { kind: 'link' };
    case 'view': return { kind: 'view' };
    default: return null;
  }
}

// Applies a vocabulary entry at the caret: dispatches the resolved
// action through the bound engine (`editor` is the crepe instance,
// `view` its ProseMirror view). The `link` and `image` kinds hand off
// to the host's address editor. Returns the action kind — a hand-off
// kind leaves the focus with the host's address input.
export function applyBlock({ id, state, editor, view, openLinkEditor, openImageEditor, openViewPicker }) {
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
    case 'view':
      // The host resolves the picked saved view; the fence it inserts
      // carries the view ref (`{ id, name }`, the deleted-view name).
      if (openViewPicker) openViewPicker(ref => insertViewFence(ref, view));
      break;
    default:
      break;
  }
  return action.kind;
}

export function insertViewFence(ref, view) {
  if ((!ref?.id && !ref?.typeId) || !view) return;
  const { code_block } = view.state.schema.nodes;
  const target = ref.id
    ? { id: String(ref.id), typeId: String(ref.typeId || ''), name: String(ref.name || '') }
    : { typeId: String(ref.typeId), name: String(ref.name || '') };
  const body = view.state.schema.text(JSON.stringify(target));
  view.dispatch(view.state.tr.replaceSelectionWith(code_block.createChecked({ language: 'view' }, body)).scrollIntoView());
}

function focusedListItem(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'list_item') return { pos: $from.before(depth), node };
  }
  return null;
}

// A three-by-three table node over the gfm schema.
function insertTable(view) {
  const { table, table_row, table_header, table_cell, paragraph } = view.state.schema.nodes;
  const row = (cellType, count) => table_row.createChecked(null, Array.from({ length: count }, () => cellType.createChecked(null, paragraph.create())));
  const node = table.createChecked(null, [row(table_header, 3), row(table_cell, 3), row(table_cell, 3)]);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}
