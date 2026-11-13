import { BaseEntity } from '~/server/core/blocks/index.js';


export class Organization extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      roles: {},
      roleAssignments: {},
      ...(this.data || {})
    };
  }

  get name() { return this.identity.name; }
  get type() { return this.data.type; }
}
