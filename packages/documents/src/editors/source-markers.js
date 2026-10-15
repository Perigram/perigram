// Focused-block markdown source markers and toolbar selection state —
// the pure half of the editor's live-source seam (the Obsidian model,
// SPEC UI): the block containing the selection shows its markdown
// prefix, and inline mark runs the caret touches show their literal
// markers. Pure ProseMirror-state readers with no engine imports, so
// the toolbar logic and the specs run without a DOM; the plugin in
// `source-markers-plugin.js` turns the descriptors into decorations.

const INLINE_MARK_MARKERS = { strong: '**', emphasis: '*', code_inline: '`' };

function inBlockquote($from) {
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    if ($from.node(depth).type.name === 'blockquote') return true;
  }
  return false;
}

// The focused textblock's markdown prefix: `> ` inside a blockquote,
// `### ` for headings — combined when both apply.
export function focusedBlockPrefix(state) {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return '';
  let prefix = inBlockquote($from) ? '> ' : '';
  if (parent.type.name === 'heading') {
    prefix += `${'#'.repeat(Number(parent.attrs.level) || 1)} `;
  }
  return prefix;
}

// Inline mark runs of the focused block, merged across adjacent nodes,
// as `{ mark, from, to }` ranges in document coordinates.
export function focusedMarkRuns(state) {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return [];
  const blockStart = $from.start();
  const runs = [];
  parent.forEach((node, offset) => {
    for (const mark of node.marks || []) {
      const name = mark.type.name;
      if (!INLINE_MARK_MARKERS[name]) continue;
      const from = blockStart + offset;
      const to = from + node.nodeSize;
      const last = runs[runs.length - 1];
      if (last && last.mark === name && last.to >= from) last.to = Math.max(last.to, to);
      else runs.push({ mark: name, from, to });
    }
  });
  return runs;
}

// Descriptor form consumed by the plugin: `{ pos, side, text }` widgets.
// Mark markers appear only for runs the selection touches — the source
// is visible exactly where editing happens, rendered content elsewhere.
export function focusedMarkerDescriptors(state) {
  const { from, to } = state.selection;
  const descriptors = [];
  const prefix = focusedBlockPrefix(state);
  if (prefix) {
    descriptors.push({ pos: state.selection.$from.start(), side: -1, text: prefix });
  }
  for (const run of focusedMarkRuns(state)) {
    if (run.from > to || run.to < from) continue;
    const marker = INLINE_MARK_MARKERS[run.mark];
    descriptors.push({ pos: run.from, side: -1, text: marker });
    descriptors.push({ pos: run.to, side: 1, text: marker });
  }
  return descriptors;
}

// The toolbar's view of the selection: focused block kind, heading
// level, list/quote containers, and the marks about to be applied.
export function selectionState(state) {
  const { from, to, $from, empty } = state.selection;
  const parent = $from.parent;
  const marks = new Set();
  if (empty) {
    for (const mark of state.storedMarks ?? $from.marks()) marks.add(mark.type.name);
  } else {
    state.doc.nodesBetween(from, to, node => {
      for (const mark of node.marks || []) {
        if (INLINE_MARK_MARKERS[mark.type.name] || mark.type.name === 'link') marks.add(mark.type.name);
      }
    });
  }
  let bullet = false;
  let ordered = false;
  let quote = false;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === 'bullet_list') bullet = true;
    else if (name === 'ordered_list') ordered = true;
    else if (name === 'blockquote') quote = true;
  }
  return {
    block: parent.type.name,
    headingLevel: parent.type.name === 'heading' ? Number(parent.attrs.level) || 1 : null,
    bullet,
    ordered,
    quote,
    marks: [...marks]
  };
}
