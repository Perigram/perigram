import { BaseEntity } from '~/server/core/blocks/index.js';

export class Library extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
    this.summary = this.summary || {};
  }

  get material() {
    return this.data?.material || null;
  }
}
