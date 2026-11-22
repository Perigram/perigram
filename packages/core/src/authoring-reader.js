import { deepFreeze } from './json.js';

// Grammar law lives in packages/core/README.md §Authoring DSL.
const WHITESPACE = new Set([' ', '\t', '\n', '\r', ',']);
const TERMINATORS = new Set(['(', ')', '[', ']', '{', '}', '"', ';', ...WHITESPACE]);
const SIMPLE_KEYWORD = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const QUALIFIED_KEYWORD = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r' };
export const AUTHORING_DSL_MAX_SOURCE_LENGTH = 256 * 1024;
export const AUTHORING_DSL_MAX_NESTING_DEPTH = 128;

export function readRestrictedEdn(source, {
  maxSourceLength = AUTHORING_DSL_MAX_SOURCE_LENGTH,
  maxNestingDepth = AUTHORING_DSL_MAX_NESTING_DEPTH
} = {}) {
  if (typeof source !== 'string') throw new Error('Reader source must be a string');
  if (source.length > maxSourceLength) {
    return { forms: [], diagnostics: [{ code: 'source-too-large', message: `DSL source exceeds maximum length ${maxSourceLength}` }] };
  }
  const reader = new Reader(source, maxNestingDepth);
  const forms = [];
  for (;;) {
    reader.skipIgnorable();
    if (reader.atEnd()) break;
    const form = reader.readForm();
    if (form) forms.push(form);
  }
  return { forms: deepFreeze(forms), diagnostics: deepFreeze(reader.diagnostics) };
}

class Reader {
  constructor(source, maxNestingDepth) {
    this.source = source;
    this.maxNestingDepth = maxNestingDepth;
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.diagnostics = [];
  }

  atEnd() {
    return this.index >= this.source.length;
  }

  peek() {
    return this.source[this.index];
  }

  advance() {
    const char = this.source[this.index];
    this.index += 1;
    if (char === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return char;
  }

  skipIgnorable() {
    while (!this.atEnd()) {
      const char = this.peek();
      if (WHITESPACE.has(char)) {
        this.advance();
      } else if (char === ';') {
        while (!this.atEnd() && this.peek() !== '\n') this.advance();
      } else {
        break;
      }
    }
  }

  snapshot() {
    return { index: this.index, line: this.line, column: this.column };
  }

  position(start) {
    return { line: start.line, column: start.column, span: { start: start.index, end: this.index } };
  }

  report(code, message, pos) {
    this.diagnostics.push({ code, message, pos });
  }

  readForm(depth = 0) {
    const start = this.snapshot();
    const char = this.peek();
    if (depth > this.maxNestingDepth) {
      this.advance();
      this.report('nesting-depth', `DSL nesting exceeds maximum depth ${this.maxNestingDepth}`, this.position(start));
      return null;
    }
    if (char === '(' || char === '[' || char === '{') return this.readContainer(char, depth);
    if (char === '"') return this.readString(start);
    if (char === ')' || char === ']' || char === '}') {
      this.advance();
      this.report('unexpected-delimiter', `Unexpected ${char}`, this.position(start));
      return null;
    }
    return this.readToken(start);
  }

  readContainer(opener, depth) {
    const start = this.snapshot();
    this.advance();
    const closer = { '(': ')', '[': ']', '{': '}' }[opener];
    const items = [];
    for (;;) {
      this.skipIgnorable();
      if (this.atEnd()) {
        this.report('unclosed-form', `Unclosed ${opener} opened here`, this.position(start));
        break;
      }
      if (this.peek() === closer) {
        this.advance();
        break;
      }
      const item = this.readForm(depth + 1);
      if (item) items.push(item);
    }
    const pos = this.position(start);
    if (opener !== '{') {
      return { type: opener === '(' ? 'list' : 'vector', items, pos };
    }
    if (items.length % 2 === 1) this.report('map-arity', 'Map requires an even number of forms', pos);
    const entries = [];
    for (let index = 0; index + 1 < items.length; index += 2) {
      entries.push({ key: items[index], value: items[index + 1] });
    }
    return { type: 'map', entries, pos };
  }

  readString(start) {
    this.advance();
    let value = '';
    for (;;) {
      if (this.atEnd()) {
        this.report('unterminated-string', 'String is missing its closing quote', this.position(start));
        return { type: 'string', value, pos: this.position(start) };
      }
      const char = this.advance();
      if (char === '"') break;
      if (char !== '\\') {
        value += char;
        continue;
      }
      const escapeStart = this.snapshot();
      if (this.atEnd()) {
        this.report('unterminated-string', 'String is missing its closing quote', this.position(start));
        break;
      }
      const escape = this.advance();
      if (escape == null || !(escape in ESCAPES)) {
        this.report('invalid-escape', `Unsupported string escape \\${escape}`, this.position(escapeStart));
        value += escape;
      } else {
        value += ESCAPES[escape];
      }
    }
    return { type: 'string', value, pos: this.position(start) };
  }

  readToken(start) {
    let token = '';
    while (!this.atEnd() && !TERMINATORS.has(this.peek())) token += this.advance();
    if (token === '') {
      this.advance();
      return null;
    }
    const pos = this.position(start);
    if (token[0] === ':') {
      const name = token.slice(1);
      if (SIMPLE_KEYWORD.test(name) || QUALIFIED_KEYWORD.test(name)) {
        return { type: 'keyword', name, pos };
      }
      this.report('invalid-keyword', `Invalid keyword ${token}`, pos);
      return null;
    }
    if (token === 'true' || token === 'false') return { type: 'boolean', value: token === 'true', pos };
    if (token === 'nil') return { type: 'nil', pos };
    if (NUMBER.test(token)) return { type: 'number', value: Number(token), pos };
    this.report('unsupported-token', `Unsupported token ${token}: readable forms are keywords, strings, numbers, booleans, and nil`, pos);
    return null;
  }
}
