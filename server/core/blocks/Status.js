import { ObjectId } from 'mongodb';

/**
 * Status Block - v24 Standardized
 * Immutable snapshot of an entity state at a point in time.
 */
export class Status {
  constructor(state, userId, metadata = {}, eventId = null) {
    if (!state) throw new Error('Status: state is required');
    if (!userId) throw new Error('Status: userId is required');
    
    this.state = state;
    this.userId = userId;
    this.timestamp = new Date();
    this.metadata = metadata || {};
    this.eventId = eventId ? (eventId instanceof ObjectId ? eventId : new ObjectId(eventId)) : null;
  }

  toJSON() {
    return {
      state: this.state,
      userId: this.userId,
      timestamp: this.timestamp,
      metadata: this.metadata,
      eventId: this.eventId
    };
  }
}
