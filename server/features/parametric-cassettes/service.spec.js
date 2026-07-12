import { describe, expect, it, vi } from 'vitest';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';

vi.mock('./repository.js', () => ({
  findTemplateById: vi.fn()
}));

vi.mock('../../db/mongo.js', () => ({
  connectDB: vi.fn()
}));

import * as repository from './repository.js';
import { evaluateTemplate } from './service.js';

describe('parametric cassette OCCS evaluation', () => {
  it('unwraps updated template definition containers before OCCS baking', async () => {
    repository.findTemplateById.mockResolvedValue({
      _id: 'template-1',
      data: {
        type: 'PARAMETRIC',
        definition: {
          parameters: ['A', 'B', 'R'],
          definition: createDefaultOccsCassetteTemplateDefinition()
        }
      }
    });

    const result = await evaluateTemplate('template-1', { A: 700, B: 300, R: 40 });

    expect(result.nestingPolygons).toHaveLength(1);
    expect(result.nestingPolygons[0]).toMatchObject({
      workpieceId: 'wp_1',
      workpieceDefinitionId: 'wp_1_def',
      occurrenceId: 'wp_1'
    });
  });
});
