import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';

/**
 * Opens the chat thread for an entity surface (cards, inline refs,
 * popovers, directory surfaces) as the single chat popup: full-bleed
 * overlay on mobile, the token-sized drawer card on desktop — one
 * surface, one code path. The preset target is consumed on chat mount.
 *
 * The thread kind follows the support conversation contract: a `user`
 * target opens the DIRECT conversation with that person (the inbox-listed
 * 1:1 thread — same rule as status-history actor chat); every other type
 * opens the composed instance thread.
 */
export function openInstanceChat({ type = '', id = '', name = '' } = {}) {
  if (!type || !id) return;
  const chatTarget = useSupportChatTarget();
  const normalizedType = String(type).toLowerCase();
  chatTarget.value = normalizedType === 'user'
    ? { userId: String(id), name: String(name || '') }
    : { instanceKey: `instance:${type}:${id}`, name: String(name || '') };
  const supportDialog = useSupportDialog();
  supportDialog.value = true;
}
