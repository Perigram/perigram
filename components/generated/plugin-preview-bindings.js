import { unref } from 'vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

// The served plugin preview bindings, resolved per type (M7). A leaf by
// design: preview slots mount in every card, so this module imports no
// component graph — the surface loader (RemoteInstancePreview) pulls the
// mount machinery lazily, the same law the surface pack follows.
// Callers hold kebab, snake, or legacy camel spellings of the type id
// (embedded refs normalize to snake); bindings carry the kebab CTS id.
export function resolvePluginPreview(typeId = '', previews = null) {
  let bindings = previews;
  if (bindings == null) {
    try {
      bindings = unref(useFileTypeView().previews);
    } catch {
      // No active Pinia/app context (module scope, unit specs).
      bindings = [];
    }
  }
  const kebab = String(typeId)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  return (bindings || []).find(preview => preview?.type === kebab && preview?.url) || null;
}
