import { BaseEntity } from '../../../core/blocks/index.js';

/**
 * Sheet Design Entity - v24 Absolute Final
 * Digital layout representing a nested sheet.
 */
export class SheetDesign extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      geometry: raw.data?.geometry || {
        svgId: null,
        dxfId: null,
        data: null
      }
    };
  }

  get name() { return this.identity.name || `Sheet Design ${this.id.substring(0, 8)}`; }
}
