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
  'uiMapping.types.cassette': 'Cassette',
  'uiMapping.types.sheet-design': 'Sheet design',
  'uiMapping.createCaption': ({ type }) => `New ${type}`,
  'uiMapping.createCaptionFromMode': ({ type, mode }) => `New ${type} from ${mode}`
};

const i18n = {
  t: (key, params) => typeof messages[key] === 'function' ? messages[key](params) : (messages[key] || key),
  te: key => Object.hasOwn(messages, key)
};

describe('generated labels', () => {
  it('uses domain entity translations for generated screens and sections', () => {
    expect(generatedEntityLabel('sheet_design', i18n)).toBe('Sheet design');
    expect(generatedEntityLabel('sheet-design', i18n)).toBe('Sheet design');
    expect(generatedScreenLabel({ template: 'home', label: 'Home' }, i18n)).toBe('Home');
    expect(generatedScreenLabel({ typeId: 'sheet_design', label: 'Монтажник sheet_design' }, i18n)).toBe('Sheet design');
  });

  it('uses procedural create captions and hides raw status values', () => {
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      state: { to: 'NEW' },
      label: 'Create'
    }, '', i18n)).toBe('New Cassette');

    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      label: 'Создать сущность'
    }, '', i18n)).toBe('New Cassette');

    expect(generatedActionLabel({
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { from: 'NEW', to: 'DELETED' },
      label: 'DELETED'
    }, '', i18n)).toBe('Change');
  });

  it('labels generated link actions from their target entity contract', () => {
    expect(generatedActionLabel({
      actionKind: 'link',
      typeId: 'queue',
      relation: {
        key: 'cassettes',
        targetTypes: ['sheet_design']
      }
    }, '', i18n)).toBe('Sheet design');
  });

  it('accepts the projected manifest vocabulary (createInstance, link, typeId)', () => {
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 'cassette',
      label: 'Create cassette NEW'
    }, '', i18n)).toBe('New Cassette');

    expect(generatedActionLabel({
      actionKind: 'link',
      typeId: 'queue',
      relation: { key: 'cassettes', targetTypes: ['cassette'], cardinality: 'many' }
    }, '', i18n)).toBe('Cassette');

    expect(generatedScreenLabel({ template: 'typeList', typeId: 'cassette' }, i18n)).toBe('Cassette');
  });

  it('labels org-authored types by their authored name from the registry bundle', () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = {
      organizationId: 'org-1',
      process: {
        active: true,
        bundle: {
          types: [{ id: 't-k3x9fj2mqa', name: 'Job Ticket' }]
        }
      }
    };

    expect(generatedEntityLabel('t-k3x9fj2mqa', i18n)).toBe('Job Ticket');
    // The seam takes a type record or a bare id.
    expect(generatedEntityLabel({ id: 't-k3x9fj2mqa', name: 'Job Ticket' }, i18n)).toBe('Job Ticket');
    expect(generatedActionLabel({
      actionKind: 'createInstance',
      typeId: 't-k3x9fj2mqa',
      label: 'Create t-k3x9fj2mqa new'
    }, '', i18n)).toBe('New Job Ticket');

    // Without a bundle entry the unnamed placeholder stays — humanized
    // raw ids never render.
    expect(generatedEntityLabel('t-unknown', i18n)).toBe('Unnamed');
  });
});
