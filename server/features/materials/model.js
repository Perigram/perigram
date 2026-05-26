import { BaseEntity } from '~/server/core/blocks/index.js';

export class Material extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }
}
