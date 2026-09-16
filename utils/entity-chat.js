import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';
import { requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

/**
 * Opens the composed entity chat thread from any entity surface (cards,
 * inline refs, popovers). Desktop opens the chats drawer pinned to the
 * entity thread; mobile routes to the /chats tab, which consumes the preset
 * target — the same deep-link pattern the person-chat actions use.
 */
export function openEntityChat({ type = '', id = '', name = '' } = {}) {
  if (!type || !id) return;
  const chatTarget = useSupportChatTarget();
  chatTarget.value = { entityKey: `entity:${type}:${id}`, name: String(name || '') };
  if (typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches) {
    requestCloseMobileTransientSurfaces();
    navigateTo('/chats');
    return;
  }
  const supportDialog = useSupportDialog();
  supportDialog.value = true;
}
