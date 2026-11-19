// The slash panel is the formatting surface (SPEC §26) and the host
// header owns the document chrome (SPEC §4, owner direction
// 2026-11-07): the edit mount renders the editor alone and binds its
// document state — name, dirty, save, rename — into the page-chrome
// channel. The block vocabulary + its actions live in
// lib/block-vocabulary.mjs — every slash entry resolves to the
// engine's own command, with the toggle semantics the format row
// carried (an entry matching the focused block returns it to body
// text).
import { describe, it, expect } from 'vitest';
import { createSSRApp, h, reactive, ref, computed, onMounted, onBeforeUnmount, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  wrapInHeadingCommand, turnIntoTextCommand, wrapInBulletListCommand,
  wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand,
  insertHrCommand, liftListItemCommand
} from '@milkdown/preset-commonmark';
import createSurface from './text-editor.mjs';
import { BLOCK_VOCABULARY, blockIsActive, resolveBlockAction } from './lib/block-vocabulary.mjs';

const ButtonStub = (props, { slots }) => h('button', {
  'data-button-icon': props.icon || '',
  'data-button-label': props.label || '',
  'data-button-aria-label': props.ariaLabel || ''
}, slots?.default ? slots.default() : null);
const InputTextStub = props => h('input', { 'data-input-text': 'true', 'aria-label': props['aria-label'] || '' });
const PopoverStub = (props, { slots }) => (slots?.default ? slots.default() : null);

const mountContext = () => ({
  vue: { h, ref, computed, reactive, onMounted, onBeforeUnmount, defineComponent },
  components: { Button: ButtonStub, InputText: InputTextStub, Popover: PopoverStub },
  locale: { t: key => key, te: () => true, locale: ref('en') },
  sync: { onRecordChanged: () => {} }
});

const persistence = {
  title: 'Notes',
  loadDocument: async () => '# Notes',
  saveDocument: async () => {},
  rename: async () => {}
};

const mount = async (mode, pageChrome = null) => {
  const surface = createSurface(mountContext());
  const app = createSSRApp(surface, { record: { _id: 'md-1', name: 'Notes.md' }, persistence, mode, pageChrome });
  return await renderToString(app);
};

describe('text-editor surface (the header owns the document chrome)', () => {
  it('edit mount renders the editor alone, carrying no document controls', async () => {
    const html = await mount('edit');
    // The link address editor is the one input the surface itself hosts;
    // the name field and save live in the host header.
    expect(html).not.toContain('aria-label="common.rename"');
    expect(html).not.toContain('data-button-label="common.save"');
    expect(html).not.toContain('data-button-icon="pi pi-save"');
    for (const key of ['editors.heading1', 'editors.heading6', 'editors.quote', 'editors.bulletList', 'editors.numberedList', 'editors.codeBlock', 'editors.link', 'editors.paragraph']) {
      expect(html).not.toContain(`data-button-aria-label="${key}"`);
    }
    for (const icon of ['pi pi-list', 'pi pi-code', 'pi pi-link', 'pi pi-comment']) {
      expect(html).not.toContain(`data-button-icon="${icon}"`);
    }
  });

  it('binds the document state into the page-chrome channel', async () => {
    const bound = [];
    const pageChrome = reactive({ api: null, bind: next => { pageChrome.api = next; bound.push(next); } });
    await mount('edit', pageChrome);
    expect(bound).toHaveLength(1);
    const api = bound[0];
    expect(typeof api.save).toBe('function');
    expect(typeof api.rename).toBe('function');
    expect(typeof api.reload).toBe('function');
    expect(api.name).toBe('Notes.md');
    expect(api.dirty).toBe(false);
  });

  it('read mount renders the document with no editing chrome', async () => {
    const html = await mount('read');
    expect(html).toContain('ck-markdown-body');
    expect(html).not.toContain('data-input-text');
    expect(html).not.toContain('data-button-icon="pi pi-save"');
  });
});

describe('block vocabulary', () => {
  it('offers the whole authorable block set', () => {
    expect(BLOCK_VOCABULARY.map(entry => entry.id)).toEqual([
      'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'bullet', 'ordered', 'todo', 'quote', 'callout',
      'codeblock', 'image', 'file', 'diagram', 'divider', 'table', 'instance', 'link', 'view',
      'reference', 'graph-output'
    ]);
    for (const entry of BLOCK_VOCABULARY) {
      expect(entry.labelKey, `${entry.id} carries a label key`).toMatch(/^editors\./);
      expect(entry.match.length, `${entry.id} carries match terms`).toBeGreaterThan(0);
      expect(entry.glyph || entry.glyphText, `${entry.id} carries a glyph`).toBeTruthy();
    }
  });

  it('marks the focused block kind active', () => {
    const base = { block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] };
    expect(blockIsActive('h3', { ...base, block: 'heading', headingLevel: 3 })).toBe(true);
    expect(blockIsActive('h4', { ...base, block: 'heading', headingLevel: 3 })).toBe(false);
    expect(blockIsActive('todo', { ...base, bullet: true, task: true })).toBe(true);
    expect(blockIsActive('bullet', { ...base, bullet: true, task: true })).toBe(true);
    expect(blockIsActive('paragraph', base)).toBe(true);
    expect(blockIsActive('paragraph', { ...base, quote: true })).toBe(false);
    expect(blockIsActive('codeblock', { ...base, block: 'code_block' })).toBe(true);
  });
});

describe('slash actions resolve to the engine commands', () => {
  const paragraph = { block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] };

  it('applies the heading command with the level, and toggles back to body text', () => {
    const on = resolveBlockAction('h2', paragraph);
    expect(on.command).toBe(wrapInHeadingCommand);
    expect(on.payload).toBe(2);
    const off = resolveBlockAction('h2', { ...paragraph, block: 'heading', headingLevel: 2 });
    expect(off.command).toBe(turnIntoTextCommand);
  });

  it('applies and lifts the lists and the quote', () => {
    expect(resolveBlockAction('bullet', paragraph).command).toBe(wrapInBulletListCommand);
    expect(resolveBlockAction('bullet', { ...paragraph, bullet: true }).command).toBe(liftListItemCommand);
    expect(resolveBlockAction('ordered', paragraph).command).toBe(wrapInOrderedListCommand);
    expect(resolveBlockAction('ordered', { ...paragraph, ordered: true }).command).toBe(liftListItemCommand);
    expect(resolveBlockAction('quote', paragraph).command).toBe(wrapInBlockquoteCommand);
    expect(resolveBlockAction('quote', { ...paragraph, quote: true })).toEqual({ kind: 'lift' });
  });

  it('authors the task checkbox inside the focused list item', () => {
    expect(resolveBlockAction('todo', paragraph)).toEqual({ kind: 'task', checked: false, wrap: true });
    expect(resolveBlockAction('todo', { ...paragraph, bullet: true })).toEqual({ kind: 'task', checked: false, wrap: false });
    expect(resolveBlockAction('todo', { ...paragraph, bullet: true, task: true })).toEqual({ kind: 'task', checked: null, wrap: false });
  });

  it('inserts through the engine commands and hands the link to the host address editor', () => {
    expect(resolveBlockAction('codeblock', paragraph).command).toBe(createCodeBlockCommand);
    expect(resolveBlockAction('codeblock', { ...paragraph, block: 'code_block' }).command).toBe(turnIntoTextCommand);
    expect(resolveBlockAction('diagram', paragraph)).toEqual({ kind: 'command', command: createCodeBlockCommand, payload: 'mermaid' });
    expect(resolveBlockAction('divider', paragraph).command).toBe(insertHrCommand);
    expect(resolveBlockAction('image', paragraph)).toEqual({ kind: 'image' });
    expect(resolveBlockAction('file', paragraph)).toEqual({ kind: 'file' });
    expect(resolveBlockAction('callout', paragraph)).toEqual({ kind: 'callout' });
    expect(resolveBlockAction('table', paragraph)).toEqual({ kind: 'table' });
    expect(resolveBlockAction('instance', paragraph)).toEqual({ kind: 'instance' });
    expect(resolveBlockAction('link', paragraph)).toEqual({ kind: 'link' });
    expect(resolveBlockAction('view', paragraph)).toEqual({ kind: 'view' });
  });
});
