import { describe, expect, it } from 'vitest';
import {
  entityFromSelectOption,
  entitySelectOptions,
  entityTypeFromSelectOption,
  selectOptionLabel,
  selectOptionForValue,
  selectOptionValue
} from './entity-select.js';

const queue = {
  _id: 'queue-1',
  identity: { uid: 'queue-1', name: 'Queue 1' },
  lineage: {},
  data: {}
};

describe('entity select option contract', () => {
  it('accepts canonical DTOs and wrapped entity options without treating ordinary objects as entities', () => {
    expect(entityFromSelectOption(queue)).toBe(queue);
    expect(entityFromSelectOption({ label: 'Queue 1', value: 'queue-1', entity: queue })).toBe(queue);
    expect(entityFromSelectOption({ label: 'Draft', value: 'DRAFT' })).toBeNull();
  });

  it('uses explicit entity types and never infers them from entity data', () => {
    expect(entityTypeFromSelectOption({ entityType: 'queue', entity: queue })).toBe('queue');
    expect(entityTypeFromSelectOption({ entityType: 'queue' }, 'project')).toBe('project');
    expect(entityTypeFromSelectOption({ entity: { ...queue, data: { type: 'queue' } } })).toBe('');
  });

  it('resolves selected options through the same optionValue path as PrimeVue', () => {
    const options = [{ label: 'Queue 1', value: { id: 'queue-1' }, entity: queue }];
    expect(selectOptionValue(options[0], 'value.id')).toBe('queue-1');
    expect(selectOptionForValue(options, 'queue-1', 'value.id')).toBe(options[0]);
    expect(selectOptionLabel(options[0], 'label')).toBe('Queue 1');
  });

  it('enables entity rendering only when both DTO and entity type are available', () => {
    expect(entitySelectOptions([queue], 'queue')).toHaveLength(1);
    expect(entitySelectOptions([queue])).toEqual([]);
    expect(entitySelectOptions([{ label: 'Queue', value: 'queue-1', entity: queue, entityType: 'queue' }])).toHaveLength(1);
  });
});
