import { BaseEntity } from '../../core/blocks/index.js';

export class Machine extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = {
      ...this.data,
      workingArea: {
        width: Number(raw.data?.workingArea?.width || 0),
        length: Number(raw.data?.workingArea?.length || 0)
      },
      boundaryOffset: Number(raw.data?.boundaryOffset || 0),
      description: raw.data?.description || ''
    };
  }
}
