import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Sheet Entity - v24 Absolute Final
 */
export class Sheet extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }

  get name() { return this.identity?.name || this.data?.serial || 'Sheet'; }
}
