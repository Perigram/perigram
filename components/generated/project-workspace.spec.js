import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const entityPageSource = readFileSync(new URL('../shared/EntityPage.vue', import.meta.url), 'utf8');
const generatedScreenSource = readFileSync(new URL('./GeneratedScreen.vue', import.meta.url), 'utf8');
const standardPageSource = readFileSync(new URL('../shared/StandardPage.vue', import.meta.url), 'utf8');
const entityFileSource = readFileSync(new URL('./GeneratedEntityFile.vue', import.meta.url), 'utf8');
const detailBodySource = readFileSync(new URL('./GeneratedEntityDetailBody.vue', import.meta.url), 'utf8');
const queueDetailSource = readFileSync(new URL('./GeneratedQueueDetail.vue', import.meta.url), 'utf8');
const entityCardSource = readFileSync(new URL('../shared/EntityCard.vue', import.meta.url), 'utf8');
const splitNodeSource = readFileSync(new URL('../shared/WorkspaceSplitNode.vue', import.meta.url), 'utf8');
const entityWorkspaceSource = readFileSync(new URL('../shared/EntityWorkspace.vue', import.meta.url), 'utf8');
const appLayoutSource = readFileSync(new URL('../../layouts/app.vue', import.meta.url), 'utf8');

describe('generated project workspace architecture', () => {
  it('renders pane-native entity files in recursively splittable workspace panes', () => {
    expect(source).toContain('<GeneratedEntityFile');
    expect(source).toContain('<WorkspaceSplitNode');
    expect(source).toContain('<Splitter');
    expect(source).toContain('<Tree');
    expect(source).not.toContain('<GeneratedEntityDetail');
    expect(source).not.toContain('<ScrollablePanel');
    expect(source).not.toContain('project.lifecycle');
    expect(splitNodeSource).toContain(":layout=\"node.orientation\"");
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
    expect(source).toContain('section.region.actions');
    expect(source).toContain("actionParentType(action) === 'project'");
    expect(source).toContain('props.screenActions');
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

  it('owns a borderless flush frame and dense independently scrolling Explorer', () => {
    expect(source).toContain("class=\"flex h-full min-h-0 flex-1 flex-col overflow-hidden\"");
    expect(source).toContain('!border-0 !p-0');
    expect(source).toContain("'!px-1 !py-0.5 !gap-1'");
    expect(generatedScreenSource).toContain(':workspace="Boolean(screenOverload)"');
    expect(standardPageSource).toContain("'h-full min-h-0 max-w-none flex-1 gap-0 overflow-hidden'");
    expect(appLayoutSource).toContain('isGeneratedWorkspaceRoute');
    expect(appLayoutSource).toContain("'max-w-none overflow-hidden p-0");
  });

  it('shows breadcrumb menus for actual alternatives rather than sibling array length', () => {
    expect(appLayoutSource).toContain('breadcrumbAlternatives(crumb).length');
    expect(appLayoutSource).toContain('(sibling.id || sibling.to) !== crumb.to');
    expect(appLayoutSource).not.toContain('crumb.siblings.length > 1');
  });
});
