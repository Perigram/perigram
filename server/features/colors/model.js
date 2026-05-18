import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Color Entity - v24 Absolute Final
 */
export class Color extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }
}
