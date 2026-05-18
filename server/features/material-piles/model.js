import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Material Pile Entity - v24 Absolute Final
 */
export class MaterialPile extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }

  get name() { return this.identity?.name || this.data?.serial || 'Material Pile'; }
}
