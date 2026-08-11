import { describe, expect, it } from 'vitest';
import {
  normalizePersistedProcessName,
  normalizeProcessDisplayName,
  processDisplayEntity
} from './processDesignerDisplay.js';

describe('process designer display names', () => {
  it('collapses repeated draft suffixes without changing the base name', () => {
    expect(normalizeProcessDisplayName('Manufacturing draft draft draft')).toBe('Manufacturing');
  });

  it('does not alter names that contain draft as meaningful text', () => {
    expect(normalizeProcessDisplayName('Drafting workflow')).toBe('Drafting workflow');
  });

  it('handles empty names', () => {
    expect(normalizeProcessDisplayName()).toBe('');
  });

  it('collapses persisted draft suffixes to one without renaming ordinary processes', () => {
    expect(normalizePersistedProcessName('Manufacturing draft draft draft')).toBe('Manufacturing draft');
    expect(normalizePersistedProcessName('Drafting workflow')).toBe('Drafting workflow');
  });

  it('projects a compact entity name without mutating the stored DTO', () => {
    const entity = {
      _id: 'process-1',
      identity: { uid: 'process-1', name: 'Manufacturing draft draft' }
    };

    expect(processDisplayEntity(entity).identity.name).toBe('Manufacturing');
    expect(entity.identity.name).toBe('Manufacturing draft draft');
  });
});
