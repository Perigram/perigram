import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const entityPageSource = readFileSync(new URL('../shared/EntityPage.vue', import.meta.url), 'utf8');
const generatedScreenSource = readFileSync(new URL('./GeneratedScreen.vue', import.meta.url), 'utf8');
const standardPageSource = readFileSync(new URL('../shared/StandardPage.vue', import.meta.url), 'utf8');
const entityFileSource = readFileSync(new URL('./GeneratedEntityFile.vue', import.meta.url), 'utf8');
const workspacePaneSource = readFileSync(new URL('./GeneratedWorkspacePane.vue', import.meta.url), 'utf8');
const workspacePageSource = readFileSync(new URL('./GeneratedWorkspacePage.vue', import.meta.url), 'utf8');
const workspacePagesSource = readFileSync(new URL('./workspace-pages.js', import.meta.url), 'utf8');
const projectContextActionsSource = readFileSync(new URL('./project-context-actions.js', import.meta.url), 'utf8');
const detailBodySource = readFileSync(new URL('./GeneratedEntityDetailBody.vue', import.meta.url), 'utf8');
const queueDetailSource = readFileSync(new URL('./GeneratedQueueDetail.vue', import.meta.url), 'utf8');
const entityCardSource = readFileSync(new URL('../shared/EntityCard.vue', import.meta.url), 'utf8');
const splitNodeSource = readFileSync(new URL('../shared/WorkspaceSplitNode.vue', import.meta.url), 'utf8');
const entityWorkspaceSource = readFileSync(new URL('../shared/EntityWorkspace.vue', import.meta.url), 'utf8');
const appLayoutSource = readFileSync(new URL('../../layouts/app.vue', import.meta.url), 'utf8');

describe('generated project workspace architecture', () => {
  it('renders pane-native entity files and registered pages in recursively splittable workspace panes', () => {
    expect(source).toContain('<GeneratedWorkspacePane');
    expect(source).toContain('<WorkspaceSplitNode');
    expect(source).toContain('<Splitter');
    expect(source).toContain('<Tree');
    expect(source).not.toContain('<GeneratedEntityDetail');
    expect(source).not.toContain('<ScrollablePanel');
    expect(source).not.toContain('project.lifecycle');
    expect(splitNodeSource).toContain(":layout=\"node.orientation\"");
    expect(workspacePaneSource).toContain('<GeneratedEntityFile');
    expect(workspacePaneSource).toContain('<GeneratedWorkspacePage');
    expect(workspacePageSource).toContain('resolveGeneratedWorkspacePage');
    expect(workspacePagesSource).not.toContain("id: 'project-actions'");
    expect(workspacePagesSource).toContain("id: 'cassette-designer'");
    expect(entityFileSource).toContain('<GeneratedEntityDetailBody');
    expect(entityFileSource).toContain('generatedDetailActionIds');
    expect(entityFileSource).not.toContain('<EntitySurfaceContent');
    expect(detailBodySource).toContain('resolveGeneratedEntityDetailOverload');
    expect(detailBodySource).toContain('actionProducesEntityType');
    expect(queueDetailSource).toContain('<QueueEditor');
    expect(queueDetailSource).toContain(':flush="flush"');
    expect(entityWorkspaceSource).toContain('container-type: inline-size');
    expect(entityWorkspaceSource).toContain('@container (min-width: 64rem)');
  });

  it('stays inside compiled screen sources and actions', () => {
    expect(source).toContain('sourceStateForRegion');
    expect(source).toContain('projectContextActionEntries');
    expect(source).toContain('props.screenActions');
    expect(projectContextActionsSource).toContain("parentEntityType(action) === 'project'");
    expect(projectContextActionsSource).toContain('actionAppliesToEntity(action, project, \'project\')');
    expect(source).not.toContain('cncRelations');
    expect(source).not.toContain('relationKeysForAction');
    expect(source).not.toContain('authStore.actionManifest.filter');
  });

  it('keeps entity pages canonical and collapses page/card actions into ellipsis menus', () => {
    expect(source).not.toContain('variant="workspace"');
    expect(entityPageSource).not.toContain("variant: { type: String");
    expect(entityPageSource).not.toContain("props.variant === 'workspace'");
    expect(entityPageSource).toContain('<EntityActionsPopover');
    expect(entityCardSource).toContain('<EntityActionsPopover');
    expect(entityFileSource).toContain('<EntityActionsPopover');
  });

  it('keeps project actions and Explorer visibility in fixed workspace chrome', () => {
    expect(source).toContain("class=\"flex h-full min-h-0 flex-1 flex-col overflow-hidden\"");
    expect(source).toContain('data-project-actions-strip');
    expect(source).toContain('<GeneratedProjectActionPalette');
    expect(source).toContain('class="min-h-0 flex-1 overflow-hidden"');
    expect(source).toContain('!border-0 !p-0');
    expect(source).toContain("'!px-1 !py-0.5 !gap-1'");
    expect(source).toContain('explorerOpen');
    expect(source).toContain("project.collapseExplorer");
    expect(source).toContain("project.expandExplorer");
    expect(source.match(/:node="paneTree"/g)).toHaveLength(1);
    expect(source).toContain('key="workspace-content"');
    expect(source).toContain(':size="15"');
    expect(source).toContain(':min-size="10"');
    expect(source).toContain(':size="explorerOpen ? 85 : 100"');
    expect(source).not.toContain("pageId: 'project-actions'");
    expect(workspacePaneSource).not.toContain('showExplorerToggle');
    expect(entityFileSource).not.toContain('project.expandExplorer');
    expect(workspacePageSource).not.toContain('project.expandExplorer');
    expect(source).not.toContain('chrome-signal-rule');
    expect(entityFileSource).not.toContain('chrome-signal-rule');
    expect(workspacePageSource).not.toContain('chrome-signal-rule');
    expect(source).toContain('bg-chrome');
    expect(generatedScreenSource).toContain(':workspace="Boolean(screenOverload)"');
    expect(standardPageSource).toContain("'h-full min-h-0 max-w-none flex-1 gap-0 overflow-hidden'");
    expect(appLayoutSource).toContain('isGeneratedWorkspaceRoute');
    expect(appLayoutSource).toContain("'max-w-none overflow-hidden p-0");
  });

  it('leaves initial and newly split panes empty until Explorer selection', () => {
    expect(source).toContain("const paneTree = ref(createWorkspaceLeaf('pane-1'));");
    expect(source).toContain('createWorkspaceLeaf(`pane-${++paneSequence.value}`)');
    expect(source).toContain("const key = activePane.value?.selectionKey || '';");
    expect(source).toContain('if (pane.selectionKey && !visibleKeys.has(pane.selectionKey))');
    expect(source).not.toContain('defaultPaneKey');
    expect(source).not.toContain('|| projectItem.value');
  });

  it('shows breadcrumb menus for actual alternatives rather than sibling array length', () => {
    expect(appLayoutSource).toContain('breadcrumbAlternatives(crumb).length');
    expect(appLayoutSource).toContain('(sibling.id || sibling.to) !== crumb.to');
    expect(appLayoutSource).not.toContain('crumb.siblings.length > 1');
  });
});
