import { BaseEntity } from '../../core/blocks/index.js';

export class EntityName extends BaseEntity {
  constructor(raw = {}) {
    super(raw);

    this.data = {
      ...this.data,
      customField: raw.customField || raw.data?.customField || ''
    };
  }

  get name() { return this.identity.name; }
  get slug() { return this.identity.slug; }
}

