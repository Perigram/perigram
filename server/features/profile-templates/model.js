import { BaseEntity } from '../../core/blocks/index.js';

export class ProfileTemplate extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }
}

