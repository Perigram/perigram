import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const entityPageSource = readFileSync(new URL('../shared/EntityPage.vue', import.meta.url), 'utf8');
const generatedScreenSource = readFileSync(new URL('./GeneratedScreen.vue', import.meta.url), 'utf8');
const standardPageSource = readFileSync(new URL('../shared/StandardPage.vue', import.meta.url), 'utf8');
const scrollablePanelSource = readFileSync(new URL('../shared/ScrollablePanel.vue', import.meta.url), 'utf8');
const appLayoutSource = readFileSync(new URL('../../layouts/app.vue', import.meta.url), 'utf8');

describe('generated project workspace architecture', () => {
  it('composes the generated entity detail inside canonical workspace primitives', () => {
    expect(source).toContain('<GeneratedEntityDetail');
    expect(source).toContain('<WorkspaceLanes');
    expect(source).toContain('<ScrollablePanel');
    expect(source).toContain('<Tree');
    expect(source).not.toContain('<EntityCard');
  });

  it('stays inside compiled screen sources and actions', () => {
    expect(source).toContain('sourceStateForRegion');
    expect(source).toContain('section.region.actions');
    expect(source).not.toContain('cncRelations');
    expect(source).not.toContain('relationKeysForAction');
  });

  it('does not add overload-specific behavior to EntityPage', () => {
    expect(source).not.toContain('variant="workspace"');
    expect(entityPageSource).not.toContain("variant: { type: String");
    expect(entityPageSource).not.toContain("props.variant === 'workspace'");
  });

  it('owns a flush bounded frame with independently scrolling panes', () => {
    expect(source).toContain("class=\"flex h-full min-h-0 flex-1 flex-col overflow-hidden\"");
    expect(source).toContain('class="!gap-0"');
    expect(source).toContain('density="compact"');
    expect(generatedScreenSource).toContain(':workspace="Boolean(screenOverload)"');
    expect(standardPageSource).toContain("'h-full min-h-0 max-w-none flex-1 gap-0 overflow-hidden'");
    expect(scrollablePanelSource).toContain("props.density === 'compact' ? '!p-1' : ''");
    expect(appLayoutSource).toContain('isGeneratedWorkspaceRoute');
    expect(appLayoutSource).toContain("'max-w-none overflow-hidden p-0");
  });
});
