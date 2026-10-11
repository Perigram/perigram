import { unref } from 'vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

// The served plugin preview bindings, resolved per type (M7). A leaf by
// design: preview slots mount in every card, so this module imports no
// component graph — the surface loader (RemoteInstancePreview) pulls the
// mount machinery lazily, the same law the surface pack follows.
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
  return (bindings || []).find(preview => preview?.type === typeId && preview?.url) || null;
}
