import { describe, expect, it } from 'vitest';
import { codeMirrorTheme } from './cm-theme.js';
import { slashQuery } from './slash-menu.js';

// The editor's engine modules load through dynamic imports at mount —
// a syntax or resolution error in them never surfaces in node-side
// guards, it kills the editor live in the browser (2026-10-15: an
// unquoted hyphenated key in the CodeMirror theme object). This spec
// pulls the module graph through node once and asserts the pure half.

describe('slash query', () => {
  it('captures the /query word at the caret and rejects everything else', () => {
    expect(slashQuery('hello /head')).toBe('head');
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('plain text')).toBeNull();
    expect(slashQuery('a/b')).toBeNull();
    expect(slashQuery('')).toBeNull();
  });
});

describe('code mirror theme', () => {
  it('is a non-empty extension list', () => {
    expect(Array.isArray(codeMirrorTheme)).toBe(true);
    expect(codeMirrorTheme.length).toBeGreaterThan(0);
  });
});
