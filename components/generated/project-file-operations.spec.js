import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entityFileSource = readFileSync(new URL('./GeneratedEntityFile.vue', import.meta.url), 'utf8');
const projectWorkspaceSource = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const generatedScreenSource = readFileSync(new URL('./GeneratedScreen.vue', import.meta.url), 'utf8');
const artifactCreatorSource = readFileSync(new URL('./GeneratedArtifactCreator.vue', import.meta.url), 'utf8');
const workspacePaneSource = readFileSync(new URL('./GeneratedWorkspacePane.vue', import.meta.url), 'utf8');
const workspacePageSource = readFileSync(new URL('./GeneratedWorkspacePage.vue', import.meta.url), 'utf8');
const actionPaletteSource = readFileSync(new URL('./GeneratedProjectActionPalette.vue', import.meta.url), 'utf8');
const cassetteDesignerPageSource = readFileSync(new URL('./GeneratedCassetteDesignerWorkspacePage.vue', import.meta.url), 'utf8');
const cassetteDesignerSource = readFileSync(new URL('../CassetteDesignerV2.vue', import.meta.url), 'utf8');
const queueEditorSource = readFileSync(new URL('../QueueEditor.vue', import.meta.url), 'utf8');
const queueEntrySource = readFileSync(new URL('../entities/Queue/QueueEntryCard.vue', import.meta.url), 'utf8');
const responsiveGridSource = readFileSync(new URL('../shared/ResponsiveGrid.vue', import.meta.url), 'utf8');
const relationsBlockSource = readFileSync(new URL('../shared/EntityRelationsBlock.vue', import.meta.url), 'utf8');

describe('project file operations and queue pane density', () => {
  it('renders compiled project actions in the workspace strip and operational editors as registered pages', () => {
    expect(projectWorkspaceSource).toContain('data-project-actions-strip');
    expect(projectWorkspaceSource).toContain('<GeneratedProjectActionPalette');
    expect(projectWorkspaceSource).not.toContain("pageId: 'project-actions'");
    expect(projectWorkspaceSource).toContain('projectContextActionEntries');
    expect(projectWorkspaceSource).toContain('openWorkspacePage');
    expect(projectWorkspaceSource).toContain("t('project.linkedEntities')");
    expect(projectWorkspaceSource).toContain('resolveEntityRelationRefs');
    expect(projectWorkspaceSource).toContain('entityStore.fetchEntity');
    expect(workspacePaneSource).toContain("item?.kind === 'entity'");
    expect(workspacePaneSource).toContain("item?.kind === 'page'");
    expect(workspacePageSource).toContain('resolveGeneratedWorkspacePage');
    expect(workspacePageSource).toContain('<component');
    expect(actionPaletteSource).toContain('data-project-action-palette');
    expect(actionPaletteSource).toContain('overflow-x-auto');
    expect(actionPaletteSource).toContain('v-for="entry in actionEntries"');
    expect(actionPaletteSource).toContain('<GeneratedActionButton');
    expect(cassetteDesignerPageSource).toContain('embedded');
    expect(cassetteDesignerPageSource).toContain("pageId: 'cassette-designer'");
    expect(cassetteDesignerPageSource).not.toContain('/api/');
    expect(cassetteDesignerSource).toContain("embedded ? 'h-full'");
    expect(cassetteDesignerSource).toContain("'/api/cassettes'");
    expect(cassetteDesignerSource).not.toContain("'/api/commands/saveCassetteTemplate/run'");
    expect(relationsBlockSource).toContain(':context-action-entries="unlinkEntries(relation, item)"');
    expect(generatedScreenSource).not.toContain("$t('generatedScreen.exactEntityId')");
    expect(generatedScreenSource).not.toContain('field.required && !options.length');
    expect(generatedScreenSource).toContain('hasUploadCreator(field)');
    expect(generatedScreenSource).toContain(":label=\"$t('generatedScreen.createArtifact')\"");
    expect(artifactCreatorSource).toContain("$fetch('/api/artifacts', { method: 'POST', body: form })");
    expect(artifactCreatorSource).not.toContain("form.append('metadata'");
    expect(artifactCreatorSource).not.toContain('<Textarea');
    expect(artifactCreatorSource).toContain('error?.data?.message');
    expect(entityFileSource).not.toContain('GeneratedProjectFileHome');
    expect(entityFileSource).toContain('<GeneratedEntityDetail');
    expect(entityFileSource).not.toContain('<GeneratedEntityDetailBody');
    expect(entityFileSource).toContain('entityId: entityId.value');
    expect(entityFileSource).toContain('detailSourceState(region.sourceId)');
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
    expect(queueEntrySource).toContain('type="cassetteDesign"');
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
