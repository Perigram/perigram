import { BaseEntity } from '../../core/blocks/index.js';

export class LayerStandard extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
  }
}
