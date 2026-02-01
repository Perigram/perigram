import { BaseEntity } from '~/server/utils/blocks';

/**
 * Catalog Entity - v24 Absolute Final
 */
export class Catalog extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      const { material, pricing, options } = raw.params;
      this.data = {
        material: material || 'ALUMINUM',
        pricing: pricing || { pricePerSqm: 0, currency: 'USD' },
        options: options || { sheetThicknesses: [], foilThicknesses: [], widths: [], lengths: [] }
      };
    }
  }
}
