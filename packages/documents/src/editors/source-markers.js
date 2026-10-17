// Focused-block markdown markers — the view-only half of the
// live-source seam (the Obsidian model, SPEC UI). Only markers that
// shift no text render: the quote's `> ` sits inside crepe's blockquote
// indent. Heading prefixes and inline mark markers reflow the line the
// moment the caret enters (the glyphs take inline space) — that
// cursor-jumping is worse than the mystery, so the toolbar's pressed
// state carries those signals instead. Pure ProseMirror-state readers
// with no engine imports; the plugin in `source-markers-plugin.js`
// turns the descriptors into decorations.

export function focusedBlockPrefix(state) {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return '';
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    if ($from.node(depth).type.name === 'blockquote') return '> ';
  }
  return '';
}

// Descriptor form consumed by the plugin: `{ pos, side, text }` widgets.
export function focusedMarkerDescriptors(state) {
  const prefix = focusedBlockPrefix(state);
  if (!prefix) return [];
  return [{ pos: state.selection.$from.start(), side: -1, text: prefix }];
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
      for (const mark of node.marks || []) marks.add(mark.type.name);
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
