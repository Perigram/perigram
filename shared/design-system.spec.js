import { describe, expect, it } from 'vitest';
import fs from 'fs';
import {
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_VARIANTS,
  validateDesignSystemContracts
} from '../utils/design-system-contract.js';
import * as factories from '../test-data/factories.js';

describe('Design system manifest', () => {
  it('declares the standard entity card variants', () => {
    expect(DESIGN_SYSTEM_VARIANTS).toEqual(['card', 'compact', 'inline']);
  });

  it('has complete manifest entries and v24 DTO factories', () => {
    expect(validateDesignSystemContracts()).toEqual([]);
    expect(DESIGN_SYSTEM_ENTITY_CONTRACTS.length).toBeGreaterThan(0);

    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      const factory = factories[entry.factoryName];
      expect(typeof factory).toBe('function');

      const entity = factory();
      expect(entity.identity).toBeTruthy();
      expect(entity.origin).toBeTruthy();
      expect(entity.status).toBeTruthy();
      expect(entity.lineage).toBeTruthy();
      expect(entity.attachments).toBeTruthy();
      expect(entity.data).toBeTruthy();

      for (const doc of entry.docs) {
        expect(fs.existsSync(doc), `${entry.key} doc missing: ${doc}`).toBe(true);
      }
    }
  });

  it('uses canonical artifact attachment and data type shape', () => {
    const artifact = factories.createMockArtifact();

    expect(artifact.data.type).toBe('LAYOUT_DXF');
    expect(artifact.attachments.primary.fileId).toBeTruthy();
    expect(artifact.fileId).toBeUndefined();
  });

  it('uses string cassette template parameters matching the DTO contract', () => {
    const template = factories.createMockCassetteTemplate();

    expect(template.parameters).toEqual(['A', 'B', 'C']);
    expect(template.data.parameters).toEqual(['A', 'B', 'C']);
  });
});
