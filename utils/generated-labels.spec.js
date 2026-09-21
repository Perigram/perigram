import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { generatedActionLabel, generatedEntityLabel, generatedScreenLabel } from './generated-labels.js';
import { useAuthStore } from '~/stores/auth';

const messages = {
  'common.confirm': 'Confirm',
  'common.edit': 'Edit',
  'generatedScreen.home': 'Home',
  'generatedScreen.actions.change': 'Change',
  'generatedScreen.actions.run': 'Run',
  'generatedScreen.actions.send': 'Send',
  'entities.cassette': 'Cassette',
  'entities.cassetteDesign': 'Cassette design'
};

const i18n = {
  t: (key, params) => typeof messages[key] === 'function' ? messages[key](params) : (messages[key] || key),
  te: key => Object.hasOwn(messages, key)
};

describe('generated labels', () => {
  it('uses domain entity translations for generated screens and sections', () => {
    expect(generatedEntityLabel('cassette_design', i18n)).toBe('Cassette design');
    expect(generatedScreenLabel({ template: 'home', label: 'Home' }, i18n)).toBe('Home');
    expect(generatedScreenLabel({ typeId: 'cassette_design', label: 'Монтажник cassette_design' }, i18n)).toBe('Cassette design');
  });

  it('does not include create verbs or raw status values in generated action labels', () => {
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      status: { to: 'NEW' },
      label: 'Create'
    }, '', i18n)).toBe('Cassette');

    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      label: 'Создать сущность'
    }, '', i18n)).toBe('Cassette');

    expect(generatedActionLabel({
      actionKind: 'updateInstance',
      typeId: 'cassette',
      status: { from: 'NEW', to: 'DELETED' },
      label: 'DELETED'
    }, '', i18n)).toBe('Change');
  });

  it('labels generated link actions from their target entity contract', () => {
    expect(generatedActionLabel({
      actionKind: 'link',
      typeId: 'queue',
      relation: {
        key: 'cassettes',
        targetType: 'cassette_design'
      }
    }, '', i18n)).toBe('Cassette design');
  });

  it('accepts the projected manifest vocabulary (createInstance, link, typeId)', () => {
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      label: 'Create cassette NEW'
    }, '', i18n)).toBe('Cassette');

    expect(generatedActionLabel({
      actionKind: 'link',
      typeId: 'queue',
      relation: { key: 'cassettes', targetType: 'cassette_design', cardinality: 'many' }
    }, '', i18n)).toBe('Cassette design');

    expect(generatedScreenLabel({ template: 'typeList', typeId: 'cassette_design' }, i18n)).toBe('Cassette design');
  });

  it('labels org-authored types by their authored render label from the registry bundle', () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = {
      organizationId: 'org-1',
      process: {
        active: true,
        bundle: {
          types: [{ id: 't-k3x9fj2mqa', render: { label: 'Job Ticket' } }]
        }
      }
    };

    expect(generatedEntityLabel('t-k3x9fj2mqa', i18n)).toBe('Job Ticket');
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 't-k3x9fj2mqa',
      label: 'Create t-k3x9fj2mqa new'
    }, '', i18n)).toBe('Job Ticket');

    // Without a bundle entry the deterministic humanized fallback stays.
    expect(generatedEntityLabel('t-unknown', i18n)).toBe('t unknown');
  });
});
