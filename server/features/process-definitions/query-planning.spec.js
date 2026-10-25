import { describe, expect, it, vi } from 'vitest';
import { executeProcessQuery } from './service.js';

// The seam forwards concrete filters verbatim (the children read's
// lineage-key filter is the shipped shape) with the full auth context;
// predicate evaluation is process algebra over the returned models
// (packages/processes algebra owns it).
describe('process query seam', () => {
  it('forwards the concrete filter and the full auth context to the list adapter verbatim', async () => {
    const auth = { userId: 'user-1', organizationId: 'org-1' };
    const filters = { 'lineage.projectId': 'project-1' };
    const list = vi.fn().mockResolvedValue([{ _id: 'facade-1' }]);

    await expect(executeProcessQuery(list, filters, auth)).resolves.toEqual([{ _id: 'facade-1' }]);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(filters, auth);
  });
});
