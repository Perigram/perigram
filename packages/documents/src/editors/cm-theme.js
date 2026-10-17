// The CodeMirror voice for fenced code blocks in the document: the
// app's mono font and token-backed colors, so code reads as the app's
// technical content, never as a foreign CodeMirror skin. Values are
// CSS variables, so the theme flips with the app's dark mode on its
// own; sizes are em-relative to the document voice.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const codeMirrorTheme = [
  EditorView.theme({
    '&': {
      color: 'var(--ck-chrome-foreground)',
      fontFamily: 'var(--ck-font-mono)'
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--ck-font-mono)',
      fontSize: '0.875em'
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--ck-chrome-muted)',
      border: 'none',
      borderRight: '1px solid var(--ck-chrome-border)'
    },
    '.cm-activeLine': { backgroundColor: 'var(--ck-chrome-subtle)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--ck-chrome-foreground)'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--ck-selection-background)'
    }
  }),
  syntaxHighlighting(HighlightStyle.define([
    // The app's categorical hues — the entity tones and the quantity
    // signal — carry the token classes; the red accent and danger
    // status stay reserved for errors, never for syntax.
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--ck-entity-tone-system)' },
    { tag: [t.string, t.special(t.string), t.character], color: 'var(--ck-entity-tone-material)' },
    { tag: [t.number, t.atom, t.bool], color: 'var(--ck-signal-quantity)' },
    { tag: [t.comment, t.meta, t.processingInstruction], color: 'var(--ck-chrome-muted)' },
    { tag: [t.function(t.variableName)], color: 'var(--ck-entity-tone-output)' },
    { tag: [t.typeName, t.className, t.namespace], color: 'var(--ck-entity-tone-output)' },
    { tag: t.link, color: 'var(--ck-entity-tone-output)', textDecoration: 'underline' },
    { tag: t.heading, fontWeight: '700' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.invalid, color: 'var(--ck-status-danger)' }
  ]))
];
