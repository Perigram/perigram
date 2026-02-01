import { BaseEntity } from '~/server/utils/blocks';

/**
 * Color Entity - v24 Absolute Final
 */
export class Color extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      const { code, visuals } = raw.params;
      this.data = {
        code: code || '',
        visuals: visuals || { hexCode: '#cccccc', textureUrl: null }
      };
    }
  }
}
