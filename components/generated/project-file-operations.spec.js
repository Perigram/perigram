import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entityFileSource = readFileSync(new URL('./GeneratedEntityFile.vue', import.meta.url), 'utf8');
const projectHomeSource = readFileSync(new URL('./GeneratedProjectFileHome.vue', import.meta.url), 'utf8');
const projectWorkspaceSource = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const queueEditorSource = readFileSync(new URL('../QueueEditor.vue', import.meta.url), 'utf8');
const queueEntrySource = readFileSync(new URL('../entities/Queue/QueueEntryCard.vue', import.meta.url), 'utf8');
const responsiveGridSource = readFileSync(new URL('../shared/ResponsiveGrid.vue', import.meta.url), 'utf8');

describe('project file operations and queue pane density', () => {
  it('uses the project file body as a compiled operation launcher', () => {
    expect(entityFileSource).toContain('<GeneratedProjectFileHome');
    expect(entityFileSource).toContain("v-if=\"item.type === 'project'\"");
    expect(entityFileSource).toContain(':action-entries="launcherActionEntries"');
    expect(entityFileSource).toContain('entry => entry.launcher');
    expect(projectHomeSource).toContain('v-for="entry in actionEntries"');
    expect(projectHomeSource).toContain('<GeneratedActionButton');
    expect(projectWorkspaceSource).toContain('isProjectFileLauncherAction');
    expect(projectWorkspaceSource).toContain('launcher: true');
    expect(projectHomeSource).not.toContain('/api/');
    expect(projectHomeSource).not.toContain('actionKind');
  });

  it('lets the queue workspace consume the full pane when no support region renders', () => {
    expect(queueEditorSource).toContain('workspaceLayoutProps');
    expect(queueEditorSource).toContain('showNestingRunRegion.value ? 8 : 12');
    expect(queueEditorSource).toContain('v-bind="workspaceLayoutProps"');
  });

  it('keeps queue entries compact and makes their grid respond to actual card width', () => {
    expect(queueEntrySource).toContain('container-type: inline-size');
    expect(queueEntrySource).toContain('grid-template-columns: var(--ck-compact-preview-width) minmax(0, 1fr)');
    expect(queueEntrySource).toContain('max-width: var(--ck-bounded-grid-item-max-width)');
    expect(queueEntrySource).not.toContain('hide-dimension-layer');
    expect(queueEntrySource).toContain('fixed-frame');
    expect(queueEntrySource).toContain('type="cassetteTemplate"');
    expect(queueEntrySource).toContain('class="flex min-w-0 items-center gap-1"');
    expect(queueEntrySource).toContain("header: { class: '!hidden' }");
    expect(queueEntrySource).not.toContain('<IdentityBlock');
    expect(queueEditorSource).toContain('severity="secondary"');
    expect(queueEntrySource).not.toContain('<Divider');
    expect(queueEntrySource).not.toContain('<StateBlock');
    expect(queueEditorSource).toContain('variant="bounded"');
    expect(queueEditorSource).toContain('queueEntryParameterNames');
    expect(queueEditorSource).not.toContain('isParametricEntry');
    expect(responsiveGridSource).toContain('.responsive-grid--bounded');
    expect(responsiveGridSource).toContain('@container (min-width: 48rem)');
  });
});
