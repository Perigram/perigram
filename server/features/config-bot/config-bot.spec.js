import { describe, expect, it } from 'vitest';
import {
  createConfigBotDraftPackage,
  createConfigBotManifest,
  selectEntitiesForPrompt
} from './service.js';

describe('ConfigBot draft generation', () => {
  it('selects entities from the prompt and context without role-name branching', () => {
    const manifest = createConfigBotManifest();
    const entities = selectEntitiesForPrompt('Create a queue nesting run review page', manifest, {
      entityType: 'sheet_design'
    });

    expect(entities.map(entity => entity.type)).toEqual(expect.arrayContaining([
      'queue',
      'nesting_run',
      'sheet_design'
    ]));
  });

  it('builds an admin micro-app draft package with repo writes disabled', () => {
    const draftPackage = createConfigBotDraftPackage({
      prompt: 'Create queue nesting workflow page',
      context: { target: 'admin-micro-app', entityType: 'queue' },
      knowledgeChunks: [{ source: 'app', path: 'README.md', title: 'System', content: 'CutKit documentation' }],
      now: new Date('2026-05-27T00:00:00.000Z'),
      generatedBy: 'user-test'
    });

    expect(draftPackage.kind).toBe('admin-micro-app-draft');
    expect(draftPackage.target).toBe('admin-micro-app');
    expect(draftPackage.writes).toEqual({ mode: 'draft-only', applyEnabled: false });
    expect(draftPackage.validation.ok).toBe(true);
    expect(draftPackage.selectedEntities.map(entity => entity.type)).toContain('queue');
    expect(draftPackage.components.map(component => component.key)).toContain('queue');
    expect(draftPackage.files.map(file => file.path)).toContain('pages/admin/generated/create-queue-nesting-workflow-page.vue');
    expect(draftPackage.domainDraft.commands.generateConfigBotDraft).toBeTruthy();
  });
});
