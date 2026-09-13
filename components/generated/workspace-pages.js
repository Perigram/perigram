import ChatSupport from '~/components/ChatSupport.vue';
import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';

export const generatedWorkspacePages = [
  {
    id: 'cassette-designer',
    entityType: 'cassette',
    labelKey: 'cassette.designerTitle',
    icon: 'pi pi-pencil',
    component: GeneratedCassetteDesignerWorkspacePage,
    props: page => ({
      cassette: page.entity,
      cassettes: page.cassettes || []
    })
  },
  {
    id: 'chats',
    labelKey: 'support.chatTitle',
    icon: 'pi pi-comments',
    component: ChatSupport,
    props: () => ({ embedded: true, fullPage: true })
  }
];

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages.find(page => page.id === pageId) || null;
}
