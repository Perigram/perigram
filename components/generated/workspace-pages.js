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
  }
];

export function resolveGeneratedWorkspacePage(pageId = '') {
  return generatedWorkspacePages.find(page => page.id === pageId) || null;
}
