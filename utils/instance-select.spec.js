import { describe, expect, it } from 'vitest';
import {
  instanceFromSelectOption,
  instanceSelectOptions,
  typeIdFromSelectOption,
  selectOptionLabel,
  selectOptionForValue,
  selectOptionValue
} from './instance-select.js';

const queue = {
  _id: 'queue-1',
  identity: { uid: 'queue-1', name: 'Queue 1' },
  lineage: {},
  data: {}
};

describe('entity select option contract', () => {
  it('accepts canonical DTOs and wrapped entity options without treating ordinary objects as entities', () => {
    expect(instanceFromSelectOption(queue)).toBe(queue);
    expect(instanceFromSelectOption({ label: 'Queue 1', value: 'queue-1', entity: queue })).toBe(queue);
    expect(instanceFromSelectOption({ label: 'Draft', value: 'DRAFT' })).toBeNull();
  });

  it('uses explicit entity types and never infers them from entity data', () => {
    expect(typeIdFromSelectOption({ typeId: 'queue', entity: queue })).toBe('queue');
    expect(typeIdFromSelectOption({ typeId: 'queue' }, 'project')).toBe('project');
    expect(typeIdFromSelectOption({ entity: { ...queue, data: { type: 'queue' } } })).toBe('');
  });

  it('resolves selected options through the same optionValue path as PrimeVue', () => {
    const options = [{ label: 'Queue 1', value: { id: 'queue-1' }, entity: queue }];
    expect(selectOptionValue(options[0], 'value.id')).toBe('queue-1');
    expect(selectOptionForValue(options, 'queue-1', 'value.id')).toBe(options[0]);
    expect(selectOptionLabel(options[0], 'label')).toBe('Queue 1');
  });

  it('enables entity rendering only when both DTO and entity type are available', () => {
    expect(instanceSelectOptions([queue], 'queue')).toHaveLength(1);
    expect(instanceSelectOptions([queue])).toEqual([]);
    expect(instanceSelectOptions([{ label: 'Queue', value: 'queue-1', entity: queue, typeId: 'queue' }])).toHaveLength(1);
  });
});
