// Public organization-data consistency boundary used by feature services.
// Persistence remains owned by the instances capability; callers do not
// reach into its repository.
export {
  beginOrganizationChange,
  ensureOrganizationChangeIndexes,
  cancelOrganizationChange,
  completeOrganizationChange,
  getOrganizationChangeSequence,
  recordOrganizationChange,
  runOrganizationChange,
  withOrganizationChangeSequence,
  withOrganizationDataSnapshot
} from './organization-sequence.js';
