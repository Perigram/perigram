import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Sheet Entity - v24 Absolute Final
 */
export class Sheet extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = this.data || {};
    if (!raw._id && raw.params) {
      const { serial } = raw.params;
      this.data = {
        serial
      };
    }
  }

  get name() { return this.identity?.name || this.data?.serial || 'Sheet'; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      serial: this.data?.serial
    };
  }
  }