import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Cassette Template Entity - v24 Absolute Final
 * Base definition for a cassette (Parametric or Standard).
 */
export class Cassette extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      type: raw.type || raw.data?.type || 'PARAMETRIC',
      definition: raw.definition || raw.data?.definition || null,
      parameters: raw.parameters || raw.data?.parameters || []
    };
  }

  get name() { return this.identity.name || 'Unnamed Template'; }
  get slug() { return this.identity.slug || ''; }

  toJSON() {
    return {
      ...super.toJSON(),
      type: this.data.type,
      definition: this.data.definition,
      parameters: this.data.parameters
    };
  }
}
