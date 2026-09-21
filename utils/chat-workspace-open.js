/**
 * Opens the chats surface. With the home workspace shell deleted there are
 * no workspace chat tabs: the bounded `/chats` route (a tab of the app
 * layout's bottom bar on mobile) is the destination; callers fall back to
 * it themselves when this returns false.
 */
export function openChatInWorkspaceTab({ conversationKey = '', label = '' } = {}) {
  if (typeof window === 'undefined') return false;
  navigateTo('/chats');
  return true;
}
