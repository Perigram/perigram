import { describe, expect, it } from 'vitest';
import { readRestrictedEdn } from './authoring-reader.js';

function singleForm(source) {
  const { forms, diagnostics } = readRestrictedEdn(source);
  expect(diagnostics).toEqual([]);
  expect(forms).toHaveLength(1);
  return forms[0];
}

describe('restricted reader', () => {
  it('reads lists, vectors, and maps with nesting', () => {
    const form = singleForm('(:a [1 "two"] {:k {:nested [true nil]}})');
    expect(form.type).toBe('list');
    expect(form.items.map(item => item.type)).toEqual(['keyword', 'vector', 'map']);
    expect(form.items[1].items.map(item => item.value)).toEqual([1, 'two']);
    expect(form.items[2].entries).toHaveLength(1);
    expect(form.items[2].entries[0].key.name).toBe('k');
    expect(form.items[2].entries[0].value.entries[0].value.items.map(item => item.type)).toEqual(['boolean', 'nil']);
  });

  it('reads integers, floats, signs, and exponents', () => {
    const form = singleForm('[0 42 -3 1.5 -0.5 1e3 1.5E-3 12e+34]');
    expect(form.items.map(item => item.value)).toEqual([0, 42, -3, 1.5, -0.5, 1000, 0.0015, 12e34]);
  });

  it('reads strings with supported escapes', () => {
    const form = singleForm('["plain" "quote \\" here" "backslash \\\\" "line\\nbreak" "tab\\ttab" "return\\rtab"]');
    expect(form.items.map(item => item.value)).toEqual([
      'plain',
      'quote " here',
      'backslash \\',
      'line\nbreak',
      'tab\ttab',
      'return\rtab'
    ]);
  });

  it('reads booleans, nil, and keywords', () => {
    const form = singleForm('[true false nil :base :plugin.documents/document.compose :format-1/source]');
    expect(form.items[0].value).toBe(true);
    expect(form.items[1].value).toBe(false);
    expect(form.items[2].type).toBe('nil');
    expect(form.items.slice(3).map(item => item.name)).toEqual([
      'base',
      'plugin.documents/document.compose',
      'format-1/source'
    ]);
  });

  it('treats commas as whitespace and ; as line comments', () => {
    const loose = readRestrictedEdn(':a, :b ; trailing comment\n  :c');
    expect(loose.diagnostics).toEqual([]);
    expect(loose.forms.map(form => form.name)).toEqual(['a', 'b', 'c']);
    const outer = singleForm('(:start :a, ; comment\n:b)');
    expect(outer.items.map(item => item.name)).toEqual(['start', 'a', 'b']);
  });

  it('reads an empty document and empty containers', () => {
    expect(readRestrictedEdn('')).toEqual({ forms: [], diagnostics: [] });
    const form = singleForm('([] {})');
    expect(form.type).toBe('list');
    expect(form.items[0].items).toEqual([]);
    expect(form.items[1].entries).toEqual([]);
  });

  it('carries line, column, and span positions on every form', () => {
    const form = singleForm('(:node "x"\n  :a/b 12.5)');
    expect(form.pos).toEqual({ line: 1, column: 1, span: { start: 0, end: 23 } });
    expect(form.items[0].pos).toEqual({ line: 1, column: 2, span: { start: 1, end: 6 } });
    expect(form.items[1].pos).toEqual({ line: 1, column: 8, span: { start: 7, end: 10 } });
    expect(form.items[2].pos).toEqual({ line: 2, column: 3, span: { start: 13, end: 17 } });
    expect(form.items[3].pos).toEqual({ line: 2, column: 8, span: { start: 18, end: 22 } });
  });

  it('rejects symbols, reader macros, and other unsupported tokens', () => {
    for (const source of ['foo', '#foo', '#{1}', '#_:x', "'quote", '`deref', '@deref', '~x', '1.2.3', '--1', '-']) {
      const { diagnostics } = readRestrictedEdn(source);
      expect(diagnostics.map(item => item.code)).toContain('unsupported-token');
    }
  });

  it('rejects malformed keywords', () => {
    for (const source of [':/leading', ':trailing/', ':a/b/c', ':']) {
      const { diagnostics } = readRestrictedEdn(source);
      expect(diagnostics.map(item => item.code)).toContain('invalid-keyword');
    }
  });

  it('rejects unterminated strings and unclosed containers with mapped positions', () => {
    const string = readRestrictedEdn('"no end');
    expect(string.diagnostics[0].code).toBe('unterminated-string');
    expect(string.diagnostics[0].pos).toEqual({ line: 1, column: 1, span: { start: 0, end: 7 } });

    const unclosed = readRestrictedEdn('(:a\n  (:b');
    expect(unclosed.diagnostics[0].code).toBe('unclosed-form');
    expect(unclosed.diagnostics[0].pos.line).toBe(2);
    expect(unclosed.diagnostics[0].pos.column).toBe(3);

    const vector = readRestrictedEdn('[:a :b');
    expect(vector.diagnostics[0].code).toBe('unclosed-form');
  });

  it('rejects stray closing delimiters', () => {
    const { diagnostics } = readRestrictedEdn('(:a) ) ]');
    expect(diagnostics.map(item => item.code)).toEqual(['unexpected-delimiter', 'unexpected-delimiter']);
    expect(diagnostics[0].pos).toEqual({ line: 1, column: 6, span: { start: 5, end: 6 } });
  });

  it('rejects odd map entries', () => {
    const { diagnostics } = readRestrictedEdn('{:a}');
    expect(diagnostics.map(item => item.code)).toEqual(['map-arity']);
    expect(diagnostics[0].pos.span).toEqual({ start: 0, end: 4 });
  });

  it('rejects unsupported string escapes and keeps reading', () => {
    const { forms, diagnostics } = readRestrictedEdn('["a\\qb" "ok"]');
    expect(diagnostics.map(item => item.code)).toEqual(['invalid-escape']);
    expect(diagnostics[0].pos).toEqual({ line: 1, column: 5, span: { start: 4, end: 5 } });
    expect(forms[0].items[0].value).toBe('aqb');
    expect(forms[0].items[1].value).toBe('ok');
  });

  it('maps unsupported tokens to their source position', () => {
    const { diagnostics } = readRestrictedEdn('(:a\n  bad-symbol 1)');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('unsupported-token');
    expect(diagnostics[0].pos).toEqual({ line: 2, column: 3, span: { start: 6, end: 16 } });
  });

  it('freezes forms and diagnostics', () => {
    const { forms, diagnostics } = readRestrictedEdn('(:a)');
    expect(Object.isFrozen(forms)).toBe(true);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(forms[0])).toBe(true);
  });
});
