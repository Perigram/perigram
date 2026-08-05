import { describe, expect, it } from 'vitest';
import { generatedActionLabel, generatedEntityLabel, generatedScreenLabel } from './generated-labels.js';

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
  t: key => messages[key] || key,
  te: key => Object.hasOwn(messages, key)
};

describe('generated labels', () => {
  it('uses domain entity translations for generated screens and sections', () => {
    expect(generatedEntityLabel('cassette_design', i18n)).toBe('Cassette design');
    expect(generatedScreenLabel({ template: 'home', label: 'Home' }, i18n)).toBe('Home');
    expect(generatedScreenLabel({ entityType: 'cassette_design', label: 'Монтажник cassette_design' }, i18n)).toBe('Cassette design');
  });

  it('does not include create verbs or raw status values in generated action labels', () => {
    expect(generatedActionLabel({
      actionKind: 'createEntity',
      entityType: 'cassette',
      status: { to: 'NEW' },
      label: 'Create'
    }, '', i18n)).toBe('Cassette');

    expect(generatedActionLabel({
      actionKind: 'createEntity',
      entityType: 'cassette',
      label: 'Создать сущность'
    }, '', i18n)).toBe('Cassette');

    expect(generatedActionLabel({
      actionKind: 'updateEntity',
      entityType: 'cassette',
      status: { from: 'NEW', to: 'DELETED' },
      label: 'DELETED'
    }, '', i18n)).toBe('Change');
  });
});
