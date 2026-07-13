import { BaseEntity } from '../../core/blocks/index.js';

export class Machine extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = {
      ...this.data,
      workArea: raw.data?.workArea || { width: 3000, length: 1500 },
      boundaryOffset: raw.data?.boundaryOffset || { top: 0, right: 0, bottom: 0, left: 0 },
      default: Boolean(raw.data?.default)
    };
  }
}
