import { describe, expect, it } from 'vitest';
import {
  assertConfigBotAccess,
  createConfigBotDraftPackage,
  createConfigBotManifest,
  selectEntitiesForPrompt
} from './service.js';

describe('ConfigBot draft generation', () => {
  it('authorizes with explicit config_bot grants only', () => {
    expect(() => assertConfigBotAccess({
      userId: 'config-admin',
      permissions: { config_bot: 'admin' }
    })).not.toThrow();

    expect(() => assertConfigBotAccess({
      userId: 'user-admin',
      permissions: { users: 'admin' }
    })).toThrow(/ConfigBot access denied/);
  });

  it('selects entities from the prompt and context without preset-name branching', () => {
    const manifest = createConfigBotManifest();
    const entities = selectEntitiesForPrompt('Create a cassette sheet design review page', manifest, {
      typeId: 'sheet_design'
    });

    expect(entities.map(entity => entity.type)).toEqual(expect.arrayContaining([
      'cassette',
      'sheet_design'
    ]));
  });

  it('builds an admin micro-app draft package with repo writes disabled', () => {
    const draftPackage = createConfigBotDraftPackage({
      prompt: 'Create cassette nesting workflow page',
      context: { target: 'admin-micro-app', typeId: 'cassette' },
      knowledgeChunks: [{ source: 'app', path: 'README.md', title: 'System', content: 'Perigram documentation' }],
      now: new Date('2026-05-27T00:00:00.000Z'),
      generatedBy: 'user-test'
    });

    expect(draftPackage.kind).toBe('admin-micro-app-draft');
    expect(draftPackage.target).toBe('admin-micro-app');
    expect(draftPackage.writes).toEqual({ mode: 'draft-only', applyEnabled: false });
    expect(draftPackage.validation.ok).toBe(true);
    expect(draftPackage.selectedEntities.map(entity => entity.type)).toContain('cassette');
    expect(draftPackage.components.map(component => component.key)).toContain('cassette');
    expect(draftPackage.files.map(file => file.path)).toContain('pages/admin/generated/create-cassette-nesting-workflow-page.vue');
    expect(draftPackage.domainDraft.commands.generateConfigBotDraft).toBeTruthy();
  });
});
