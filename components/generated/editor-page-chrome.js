import { reactive } from 'vue';

/**
 * The editor page chrome channel (SPEC §4, owner direction 2026-11-07):
 * the page host creates it, the header renders from it, and the mounted
 * editor surface binds into it — `bind({ name, dirty, saving, diverged,
 * save(), rename(), reload() })` with reactive values the host's Vue
 * runtime provides. The header's title edit, save control, and the
 * dirty-marked page-dirty registration read the bound api; an editor
 * that binds nothing renders a read-only title and no save.
 */
export function createEditorChrome() {
  return reactive({
    api: null,
    bind(next) { this.api = next; }
  });
}
