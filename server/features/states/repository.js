// Compatibility adapter for legacy status-history consumers.
// All status_events persistence is owned by core/machines/repository.js.
export {
  createStatusEvent as create,
  findStatusEventsByEntity as findByEntity,
  findStatusEventsAfter as findAfter,
  findLatestStatusEventByEntity as findLatestByEntity
} from '../../core/machines/repository.js';
