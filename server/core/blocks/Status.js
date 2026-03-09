import { ObjectId } from 'mongodb';

/**
 * Status Block - v24 Standardized
 * Immutable snapshot of an entity state at a point in time.
 * (Forced reload comment)
 */
export class Status {
  constructor(state, userId, metadata = {}, eventId = null, timestamp = null) {
    if (!state) throw new Error('Status: state is required');
    
    this.state = state;
    this.userId = userId || 'SYSTEM'; // Fallback for legacy data
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
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
