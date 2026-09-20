import ChatSupport from '~/components/ChatSupport.vue';
import CallWorkspacePage from '~/components/calls/CallWorkspacePage.vue';
import { fileWorkspacePages } from '~/components/generated/file-surfaces.js';

// Entity-bound editor pages (for example the cassette designer) derive
// from the pack editor bindings through the file-surface registry; their
// page ids are the surface ids, so persisted pane state stays stable.
// Entity-less pages are always openable tabs. `ephemeral: true` marks
// runtime-parameterized pages that only open programmatically with per-call
// props (a live call room) and never appear in add-tab lists.
export const generatedWorkspacePages = [
  ...fileWorkspacePages(),
  {
    id: 'chats',
    labelKey: 'support.chatTitle',
    icon: 'pi pi-comments',
    component: ChatSupport,
    // A conversationKey pins the tab to one thread (the desktop "expand"
    // action); without it the tab opens the general inbox.
    props: page => ({
      embedded: true,
      fullPage: true,
      openCallInPane: true,
      conversationKey: page.conversationKey || ''
    })
  },
  {
    id: 'call',
    labelKey: 'call.title',
    icon: 'pi pi-phone',
    component: CallWorkspacePage,
    ephemeral: true,
    props: page => ({
      room: page.room,
      conversationKey: page.conversationKey || ''
    })
  }
];

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages.find(page => page.id === pageId) || null;
}
