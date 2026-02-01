import { BaseEntity } from '~/server/utils/blocks';

/**
 * Sheet Entity - v24 Absolute Final
 */
export class Sheet extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    if (!raw._id && raw.params) {
      const { serial } = raw.params;
      this.data = {
        serial
      };
    }
  }
}