// Source-mode formatting: the toolbar's own controls act on the markdown
// text while the MD source surface is visible — inline marks wrap (or
// unwrap) the selection, block controls set (or lift) the line's
// markdown prefix. Pure `(state, dispatch)` commands in the prose
// style, so the behavior is spec-testable without a DOM.

const INLINE_WRAPS = {
  strong: '**',
  emphasis: '*',
  code: '`'
};

const BLOCK_PREFIX = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
  bullet: '- ',
  ordered: '1. ',
  quote: '> '
};

const ANY_BLOCK_PREFIX = /^(#{1,6} |[-*+] |\d+\. |> )?/;

export function applySourceFormat(control, { href = '' } = {}) {
  if (control.id in INLINE_WRAPS) {
    const marker = INLINE_WRAPS[control.id];
    return state => wrapSelection(state, marker);
  }
  if (control.id === 'link' && href) {
    return state => insertLink(state, href);
  }
  if (control.id === 'codeblock') {
    return state => toggleFence(state);
  }
  if (control.id in BLOCK_PREFIX) {
    return state => setLinePrefix(state, BLOCK_PREFIX[control.id], control.id === 'ordered');
  }
  if (control.id === 'paragraph') {
    return state => setLinePrefix(state, '', false);
  }
  return () => false;
}

function wrapSelection(state, marker) {
  const { from, to, empty } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  const before = state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
  const wrapped = before === marker && after === marker;
  const selfWrapped = !empty
    && selected.length >= marker.length * 2
    && selected.startsWith(marker)
    && selected.endsWith(marker);
  if (wrapped) {
    return {
      changes: [
        { from: from - marker.length, to: from },
        { from: to, to: to + marker.length }
      ],
      selection: { anchor: from - marker.length }
    };
  }
  if (selfWrapped) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length }
    };
  }
  if (empty) {
    return {
      changes: { from, insert: marker + marker },
      selection: { anchor: from + marker.length }
    };
  }
  return {
    changes: [
      { from, insert: marker },
      { from: to, insert: marker }
    ],
    selection: { anchor: from + marker.length, head: to + marker.length }
  };
}

function insertLink(state, href) {
  const { from, to, empty } = state.selection.main;
  const label = empty ? '' : state.sliceDoc(from, to);
  const insert = `[${label}](${href})`;
  return {
    changes: { from, to, insert },
    selection: { anchor: from + 1, head: from + 1 + label.length }
  };
}

// Sets (or lifts) the block prefix on every line the selection touches;
// an existing block prefix of any kind is replaced, so `# Text` becomes
// `- Text` under the bullet control, and re-applying the same prefix
// lifts it. Ordered lists renumber from the first touched line.
function setLinePrefix(state, prefix, numbered) {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  const lines = [];
  for (let number = first.number; number <= last.number; number += 1) {
    lines.push(state.doc.line(number).text);
  }
  const orderedPattern = /^\d+\. /;
  const already = lines.every((line, index) => {
    if (numbered) return orderedPattern.test(line);
    return line.startsWith(prefix);
  }) && prefix !== '';
  const rebuilt = lines.map((line, index) => {
    const stripped = line.replace(ANY_BLOCK_PREFIX, '');
    if (already) return stripped;
    if (numbered) return `${index + 1}. ${stripped}`;
    return prefix ? prefix + stripped : stripped;
  });
  return {
    changes: { from: first.from, to: last.to, insert: rebuilt.join('\n') },
    selection: { anchor: from + (already ? -prefix.length : prefix.length) }
  };
}

function toggleFence(state) {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  const before = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const after = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null;
  const fencePattern = /^\s*```/;
  if (before && after && fencePattern.test(before.text) && fencePattern.test(after.text)) {
    return {
      changes: [
        { from: before.from, to: before.to + 1 },
        { from: after.from - 1, to: after.to }
      ],
      selection: { anchor: Math.max(0, before.from) }
    };
  }
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' }
    ],
    selection: { anchor: first.from + 4 }
  };
}

// The toolbar's pressed state over source text: the cursor's line
// carries a block prefix (or sits inside a fence), the selection is
// wrapped in inline markers.
export function sourceSelectionState(state) {
  const { from, to, head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const text = line.text;
  const heading = /^(#{1,6}) /.exec(text);
  let fenced = false;
  for (let number = 1; number <= line.number; number += 1) {
    if (/^\s*```/.test(state.doc.line(number).text)) fenced = !fenced;
  }
  const around = marker => state.sliceDoc(Math.max(0, from - marker.length), from) === marker
    && state.sliceDoc(to, Math.min(state.doc.length, to + marker.length)) === marker;
  return {
    block: fenced ? 'code_block' : heading ? 'heading' : 'paragraph',
    headingLevel: heading ? heading[1].length : null,
    bullet: !fenced && /^[-*+] /.test(text),
    ordered: !fenced && /^\d+\. /.test(text),
    quote: !fenced && /^> /.test(text),
    marks: [
      ...(around('**') ? ['strong'] : []),
      ...(around('*') && !around('**') ? ['emphasis'] : []),
      ...(around('`') ? ['code_inline'] : [])
    ]
  };
}
