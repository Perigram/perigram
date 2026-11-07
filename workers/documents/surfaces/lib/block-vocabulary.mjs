// The one block-authoring vocabulary (SPEC §26): every markdown
// authoring surface — the text editor today, the custom-page and
// instance-block surfaces as their phases land — offers this table
// through the slash panel and applies it through `applyBlock`. Entries
// toggle: the entry matching the focused block's kind returns the
// block to body text. Page-link, view-embed, and AI-block entries join
// the table with their phases.
import { callCommand } from '@milkdown/utils';
import { editorViewCtx } from '@milkdown/core';
import {
  wrapInHeadingCommand, turnIntoTextCommand, wrapInBulletListCommand,
  wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand,
  insertHrCommand, liftListItemCommand
} from '@milkdown/preset-commonmark';
import { lift } from '@milkdown/prose/commands';

// `state` is the source-markers selectionState of the focused block.
export const BLOCK_VOCABULARY = [
  { id: 'paragraph', labelKey: 'editors.paragraph', glyph: 'pi pi-align-left', match: ['text', 'paragraph', 'p'] },
  { id: 'h1', labelKey: 'editors.heading1', glyphText: 'H1', match: ['h1', 'heading1', 'heading'] },
  { id: 'h2', labelKey: 'editors.heading2', glyphText: 'H2', match: ['h2', 'heading2', 'heading'] },
  { id: 'h3', labelKey: 'editors.heading3', glyphText: 'H3', match: ['h3', 'heading3', 'heading'] },
  { id: 'h4', labelKey: 'editors.heading4', glyphText: 'H4', match: ['h4', 'heading4', 'heading'] },
  { id: 'h5', labelKey: 'editors.heading5', glyphText: 'H5', match: ['h5', 'heading5', 'heading'] },
  { id: 'h6', labelKey: 'editors.heading6', glyphText: 'H6', match: ['h6', 'heading6', 'heading'] },
  { id: 'bullet', labelKey: 'editors.bulletList', glyph: 'pi pi-list', match: ['bullet', 'list', 'ul'] },
  { id: 'ordered', labelKey: 'editors.numberedList', glyph: 'pi pi-list-check', match: ['ordered', 'numbered', 'ol'] },
  { id: 'todo', labelKey: 'editors.todo', glyph: 'pi pi-check-square', match: ['todo', 'task', 'check'] },
  { id: 'quote', labelKey: 'editors.quote', glyph: 'pi pi-comment', match: ['quote', 'blockquote'] },
  { id: 'callout', labelKey: 'editors.callout', glyph: 'pi pi-info-circle', match: ['callout', 'note'] },
  { id: 'codeblock', labelKey: 'editors.codeBlock', glyph: 'pi pi-code', match: ['code', 'codeblock'] },
  { id: 'diagram', labelKey: 'editors.diagram', glyph: 'pi pi-sitemap', match: ['diagram', 'mermaid', 'graph'] },
  { id: 'divider', labelKey: 'editors.divider', glyph: 'pi pi-minus', match: ['divider', 'hr', 'line'] },
  { id: 'table', labelKey: 'editors.table', glyph: 'pi pi-table', match: ['table'] },
  { id: 'link', labelKey: 'editors.link', glyph: 'pi pi-link', match: ['link', 'url'] }
];

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
    case 'callout': return { kind: 'callout' };
    case 'divider': return { kind: 'command', command: insertHrCommand };
    case 'diagram': return { kind: 'command', command: createCodeBlockCommand, payload: 'mermaid' };
    case 'table': return { kind: 'table' };
    case 'link': return { kind: 'link' };
    default: return null;
  }
}

// Applies a vocabulary entry at the caret: dispatches the resolved
// action through the bound engine (`editor` is the crepe instance,
// `view` its ProseMirror view). The `link` kind hands off to the host's
// address editor; `t` localizes the callout's seeded title. Returns the
// action kind — 'link' leaves the focus with the host's address input.
export function applyBlock({ id, state, editor, view, t, openLinkEditor }) {
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
      const title = view.state.schema.text(t('editors.calloutTitle'), [view.state.schema.marks.strong.create()]);
      view.dispatch(view.state.tr.replaceSelectionWith(blockquote.createChecked(null, paragraph.create(null, title))).scrollIntoView());
      break;
    }
    case 'table':
      insertTable(view);
      break;
    case 'link':
      openLinkEditor();
      break;
    default:
      break;
  }
  return action.kind;
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
