import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedProjectActionPalette from '~/components/generated/GeneratedProjectActionPalette.vue';

export const generatedWorkspacePages = [
  {
    id: 'project-actions',
    labelKey: 'common.actions.title',
    icon: 'pi pi-bolt',
    component: GeneratedProjectActionPalette,
    props: page => ({ actionEntries: page.actionEntries || [] })
  },
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
  }
];

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages.find(page => page.id === pageId) || null;
}
