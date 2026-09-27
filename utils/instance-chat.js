import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';

/**
 * Opens the composed instance chat thread from any instance surface (cards,
 * inline refs, popovers) as the single chat popup: full-bleed overlay on
 * mobile, the token-sized drawer card on desktop — one surface, one code
 * path. The preset target is consumed on chat mount.
 */
export function openInstanceChat({ type = '', id = '', name = '' } = {}) {
  if (!type || !id) return;
  const chatTarget = useSupportChatTarget();
  chatTarget.value = { instanceKey: `instance:${type}:${id}`, name: String(name || '') };
  const supportDialog = useSupportDialog();
  supportDialog.value = true;
}
