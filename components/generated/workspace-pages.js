import ChatSupport from '~/components/ChatSupport.vue';
import CallWorkspacePage from '~/components/calls/CallWorkspacePage.vue';
import DirectoryDetailSurface from '~/components/directory/DirectoryDetailSurface.vue';
import { fileWorkspacePages } from '~/components/generated/file-surfaces.js';

// Entity-bound editor pages (for example the cassette designer) derive
// from the pack editor bindings through the file-surface registry; their
// page ids are the surface ids, so persisted pane state stays stable.
// Entity-less pages are always openable tabs. `ephemeral: true` marks
// runtime-parameterized pages that only open programmatically with per-call
// props (a live call room) and never appear in add-tab lists.
export const generatedWorkspacePages = [
  ...fileWorkspacePages(),
  // Directory pages are the workspace home of user/organization detail:
  // types with no compiled detail screen and no editor still open as pane
  // tabs, never as standalone routes.
  {
    id: 'directoryUser',
    typeId: 'user',
    labelKey: 'entities.user',
    icon: 'pi pi-user',
    component: DirectoryDetailSurface,
    props: page => ({ typeId: 'user', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'directoryOrganization',
    typeId: 'organization',
    labelKey: 'entities.organization',
    icon: 'pi pi-building',
    component: DirectoryDetailSurface,
    props: page => ({ typeId: 'organization', instanceId: page.entity?._id || page.instanceId || '' })
  },
  {
    id: 'chats',
    labelKey: 'support.chatTitle',
    icon: 'pi pi-comments',
    component: ChatSupport,
    // The sidebar's Chats entry opens this pane tab; a conversationKey
    // pins the tab to one thread (the bottom-right popup's expand
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

// The entity-bound fallback for types with no compiled detail screen: the
// first registered workspace page bound to the type (editor pages via the
// file-surface registry, directory pages for user/organization). Panes,
// never standalone routes.
export function entityWorkspacePageIdFor(typeId = '') {
  return generatedWorkspacePages.find(page => page.typeId === typeId && !page.ephemeral)?.id || null;
}
