import { BaseEntity } from '~/server/core/blocks/index.js';

export class ToolProfile extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }
}
