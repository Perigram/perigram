import { BaseEntity } from '../../../core/blocks/index.js';

/**
 * Cassette Template Entity - v24 Absolute Final
 * Base definition for a cassette (Parametric or Standard).
 */
export class Cassette extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      type: raw.data?.type || 'PARAMETRIC',
      definition: raw.data?.definition || null,
      parameters: raw.data?.parameters || [],
      revisions: raw.data?.revisions || {}
    };
  }

  get name() { return this.identity.name || 'Unnamed Template'; }
  get slug() { return this.identity.slug || ''; }

}
