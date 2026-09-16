import { useSupportChatTarget, useSupportDialog, useEntityChatPopup } from '~/composables/useModalState';

/**
 * Opens the composed entity chat thread from any entity surface (cards,
 * inline refs, popovers) as a popup: the chats drawer on desktop, the
 * shared entity-chat dialog on mobile. The preset target is consumed on
 * chat mount.
 */
export function openEntityChat({ type = '', id = '', name = '' } = {}) {
  if (!type || !id) return;
  const chatTarget = useSupportChatTarget();
  chatTarget.value = { entityKey: `entity:${type}:${id}`, name: String(name || '') };
  if (typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches) {
    const popup = useEntityChatPopup();
    popup.value = true;
    return;
  }
  const supportDialog = useSupportDialog();
  supportDialog.value = true;
}
