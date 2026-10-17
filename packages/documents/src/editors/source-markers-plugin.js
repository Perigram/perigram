import { Plugin } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { focusedMarkerDescriptors, selectionState } from './source-markers.js';

// The engine half of the live-source seam: one ProseMirror plugin that
// renders the focused block's markdown markers as non-editable widgets
// and reports the selection state to the toolbar. Widgets never enter
// the clipboard — prosemirror serializes copies from the document
// schema, decorations are view-only.
export function createSourceMarkersPlugin({ onSelectionState = null } = {}) {
  return new Plugin({
    props: {
      decorations(state) {
        const widgets = focusedMarkerDescriptors(state).map(({ pos, side, text }) =>
          Decoration.widget(pos, buildMarker(text), { side })
        );
        return DecorationSet.create(state.doc, widgets);
      }
    },
    view(view) {
      onSelectionState?.(selectionState(view.state));
      return {
        update(next, previous) {
          if (next.selection === previous.selection && next.doc === previous.doc) return;
          onSelectionState?.(selectionState(next.state));
        }
      };
    }
  });
}

function buildMarker(text) {
  const span = document.createElement('span');
  span.className = 'md-source-marker';
  span.contentEditable = false;
  span.textContent = text;
  return span;
}
