import { BaseEntity } from '~/server/utils/blocks';

/**
 * Project Entity - v24 Absolute Final
 */
export class Project extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    // data block contains strictly non-identity fields
    if (!raw._id && raw.metadata) {
      this.data.metadata = raw.metadata;
    }
  }
}