// Empty pane tabs: the pane strip's add control opens a blank tab (IDE-like)
// instead of a content picker. Empty keys are transient placeholders — an
// empty tab renders no body (the pane's open-content prompt owns it) and is
// replaced by the first real item opened into that pane.
const EMPTY_TAB_PREFIX = 'empty:';

let emptyTabSequence = 0;

export function emptyTabKey() {
  return `${EMPTY_TAB_PREFIX}${Date.now().toString(36)}-${++emptyTabSequence}`;
}

export function isEmptyTabKey(key = '') {
  return typeof key === 'string' && key.startsWith(EMPTY_TAB_PREFIX);
}
