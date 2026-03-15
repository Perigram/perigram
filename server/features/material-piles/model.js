import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Material Pile Entity - v24 Absolute Final
 */
export class MaterialPile extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
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

  get name() { return this.identity?.name || this.data?.serial || 'Material Pile'; }

  toJSON() {
    return {
      ...super.toJSON(),
      serial: this.data?.serial,
      specs: this.data?.specs,
      stock: this.data?.stock
    };
  }
  }