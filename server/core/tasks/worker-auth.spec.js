import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../features/plugins/repository.js', () => ({
  findInstallByConnectorToken: vi.fn(async () => null)
}));

import { requireWorkerAccess, connectorWorkerType } from './worker-auth.js';
import { findInstallByConnectorToken } from '../../features/plugins/repository.js';

const eventWithToken = token => ({ node: { req: { headers: token ? { 'x-worker-token': token } : {} } } });

describe('worker access', () => {
  const previous = process.env.WORKER_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    findInstallByConnectorToken.mockResolvedValue(null);
    process.env.WORKER_TOKEN = 'global-secret';
  });

  afterEach(() => {
    process.env.WORKER_TOKEN = previous;
  });

  it('accepts the deployment worker token as global scope', async () => {
    await expect(requireWorkerAccess(eventWithToken('global-secret'))).resolves.toEqual({ scope: 'global' });
  });

  it('accepts a connector token scoped to its install', async () => {
    findInstallByConnectorToken.mockResolvedValue({ organizationId: 'org-1', pluginId: 'coatings' });
    await expect(requireWorkerAccess(eventWithToken('connector-secret'))).resolves.toEqual({
      scope: 'connector',
      organizationId: 'org-1',
      pluginId: 'coatings'
    });
  });

  it('refuses unknown tokens', async () => {
    await expect(requireWorkerAccess(eventWithToken('nope'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('pins a connector claim queue to its install', () => {
    expect(connectorWorkerType({ scope: 'connector', pluginId: 'coatings', organizationId: 'org-1' }))
      .toBe('plugin.coatings@org-1');
  });
});
