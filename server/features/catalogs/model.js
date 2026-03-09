import { BaseEntity } from '~/server/utils/blocks';

/**
 * Catalog Entity - v24 Absolute Final
 */
export class Catalog extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
    if (!raw._id && raw.params) {
      const { material, pricing, options } = raw.params;
      this.data = {
        material: material || 'ALUMINUM',
        pricing: pricing || { pricePerSqm: 0, currency: 'USD' },
        options: options || { sheetThicknesses: [], foilThicknesses: [], widths: [], lengths: [] }
      };
    }
  }

  get name() { return this.identity?.name || this.data?.material || 'Material Catalog'; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      material: this.data?.material,
      pricing: this.data?.pricing,
      options: this.data?.options
    };
  }
}
