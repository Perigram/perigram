import { describe, expect, it } from 'vitest';
import { extractDataModels } from './extract-data-models.js';

describe('generated data model extraction', () => {
  it('documents structured lineage roles without inventing nested reference fields', async () => {
    const models = await extractDataModels();
    const fields = models.flatMap(model => model.fields);

    expect(models.some(model => model.collection === 'nesting_runs')).toBe(false);
    expect(models.some(model => model.collection === 'machines')).toBe(true);
    expect(fields.some(field => field.name === 'lineage.entityId')).toBe(false);
    expect(fields.filter(field => field.name.startsWith('lineage.'))
      .every(field => field.type === 'EntityReference')).toBe(true);
  });
});
