import { BaseEntity } from '~/server/utils/blocks';

/**
 * Material Pile Entity - v24 Absolute Final
 */
export class MaterialPile extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    if (!raw._id && raw.params) {
      const { serial, specs, quantity } = raw.params;
      this.data = {
        serial,
        specs: specs || {},
        stock: {
          total: quantity || 0,
          used: 0
        }
      };
    }
  }
}