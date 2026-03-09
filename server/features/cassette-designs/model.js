import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Cassette Design Entity - v24 Absolute Final
 * Baked geometry for a specific cassette template + dimensions.
 */
export class CassetteDesign extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      geometry: raw.geometry || raw.data?.geometry || {
        data: null,
        dxfId: null
      },
      parameters: raw.parameters || raw.data?.parameters || {}
    };
  }

  get name() { return this.identity.name || `Design ${this.id.substring(0, 8)}`; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      geometry: this.data.geometry,
      parameters: this.data.parameters
    };
  }
}
