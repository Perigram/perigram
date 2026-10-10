// @perigram/plugin-sdk specs: the listing contract, both executor
// harnesses, and the platform API client. These are the plugin author's
// guarantees — the platform's install gate imports the same parseListing,
// so a listing that passes here is publishable there.
import { describe, it, expect, afterEach } from 'vitest';
import { parseListing, normalizeListing } from './listing.js';
import schema from './listing.schema.json';
import { createEndpointExecutor } from './endpoint-executor.js';
import { runClaimExecutor } from './claim-executor.js';
import { createPluginClient } from './api-client.js';

const fullListing = {
  pluginId: 'coatings',
  name: 'Coatings',
  version: '2',
  requires: ['documents'],
  declarations: {
    types: [
      { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string' } } },
      { id: 'coating', class: 'item', fields: { code: { base: 'string' } } }
    ],
    services: [
      { id: 'match', signature: { input: { base: 'json' }, output: { base: 'json' } } }
    ],
    editors: [{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }],
    attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } },
    conversions: [
      { id: 'docToCoating', label: 'Import coating', sourceKinds: ['DOC'], target: { kind: 'entity', typeId: 'coating' }, service: 'match' }
    ]
  }
};

describe('parseListing', () => {
  it('parses every declaration layer', () => {
    const layer = parseListing(fullListing);
    expect(layer.pluginId).toBe('coatings');
    expect(layer.types).toHaveLength(2);
    expect(layer.services).toHaveLength(1);
    expect(layer.editors).toEqual([{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }]);
    expect(Object.keys(layer.attachmentKinds)).toEqual(['COATING_DOC']);
    expect(layer.conversions).toHaveLength(1);
    expect(layer.requires).toEqual(['documents']);
  });

  it('refuses an editor binding for a type the plugin does not declare', () => {
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, editors: [{ type: 'cassette', surface: 'text-editor', modes: ['edit'] }] }
    })).toThrow(/editor binding for type cassette/);
  });

  it('refuses an editor binding for a non-file type', () => {
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, editors: [{ type: 'coating', surface: 'text-editor', modes: ['edit'] }] }
    })).toThrow(/requires a file type/);
  });

  it('refuses a conversion referencing an undeclared service', () => {
    expect(() => parseListing({
      ...fullListing,
      declarations: {
        ...fullListing.declarations,
        conversions: [{ id: 'x', sourceKinds: ['DOC'], target: { kind: 'artifact' }, service: 'nope' }]
      }
    })).toThrow(/which the plugin does not declare/);
  });

  it('refuses bad plugin ids, empty types, and bad service slugs', () => {
    expect(() => parseListing({ ...fullListing, pluginId: 'Not A Slug' })).toThrow(/pluginId/);
    expect(() => parseListing({ ...fullListing, declarations: { types: [] } })).toThrow(/non-empty array/);
    expect(() => parseListing({
      ...fullListing,
      declarations: { ...fullListing.declarations, services: [{ id: 'NotASlug', signature: { input: {}, output: {} } }] }
    })).toThrow(/slug/);
  });

  it('normalizes the catalog document shape', () => {
    const normalized = normalizeListing(fullListing);
    expect(normalized).toMatchObject({
      pluginId: 'coatings',
      name: 'Coatings',
      version: '2',
      requires: ['documents']
    });
    expect(Object.keys(normalized.declarations)).toEqual([
      'types', 'services', 'editors', 'attachmentKinds', 'conversions'
    ]);
  });

  it('keeps the JSON schema in lockstep with the validated fields', () => {
    const declarations = schema.properties.declarations.properties;
    expect(Object.keys(declarations)).toEqual(['types', 'services', 'editors', 'attachmentKinds', 'conversions']);
    expect(schema.properties.requires.items.pattern).toBe('^[a-z0-9-]+$');
  });
});

describe('createEndpointExecutor', () => {
  let server;

  afterEach(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    server = null;
  });

  const listen = async options => {
    server = createEndpointExecutor(options).listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    return `http://localhost:${server.address().port}`;
  };

  it('serves each service at POST /<serviceId> with JSON in and out', async () => {
    const base = await listen({ services: { match: async input => ({ matched: input?.code }) } });
    const response = await fetch(`${base}/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'C-1' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: 'C-1' });
  });

  it('answers 404 for unknown services, 405 for non-POST', async () => {
    const base = await listen({ services: { match: async () => null } });
    expect((await fetch(`${base}/other`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/match`)).status).toBe(405);
  });

  it('surfaces handler failures as 500 with the message body', async () => {
    const base = await listen({ services: { match: async () => { throw new Error('bad input'); } } });
    const response = await fetch(`${base}/match`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('bad input');
  });

  it('enforces the executor key when configured', async () => {
    const base = await listen({ services: { match: async () => 'ok' }, token: 'secret' });
    const denied = await fetch(`${base}/match`, { method: 'POST' });
    expect(denied.status).toBe(401);
    const allowed = await fetch(`${base}/match`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret' }
    });
    expect(allowed.status).toBe(200);
  });
});

describe('runClaimExecutor', () => {
  const run = { _id: 'run-1', taskId: 'plugin.coatings.match', claimToken: 'ct-1', input: { parameters: { value: { code: 'C-1' } } } };

  const mockPlatform = ({ handler, calls = [] }) => async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, token: options.headers?.['x-worker-token'] });
    if (url.endsWith('/api/tasks/claim')) {
      const served = calls.filter(call => call.url.endsWith('/api/tasks/claim')).length;
      if (served === 1) return json({ run });
      if (served === 2) {
        // Second claim signals a graceful stop by throwing a sentinel the
        // test catches; the loop treats it as a transient error and sleeps.
        throw new Error('STOP');
      }
      return json({ run: null });
    }
    if (url.endsWith('/heartbeat')) return json({ ok: true });
    if (url.endsWith('/complete')) return json({ ok: true });
    if (url.endsWith('/fail')) return json({ ok: true });
    throw new Error(`unexpected ${url}`);
  };

  const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });

  it('claims, executes the service, and completes with the output', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: async input => ({ matched: input?.code }) },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const claim = calls.find(call => call.url.endsWith('/api/tasks/claim'));
    expect(claim.token).toBe('connector-token');
    const complete = calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'));
    expect(complete.body).toEqual({ claimToken: 'ct-1', result: { output: { matched: 'C-1' } } });
  });

  it('fails the run when the handler throws', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: async () => { throw new Error('solver exploded'); } },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const fail = calls.find(call => call.url.endsWith('/api/tasks/run-1/fail'));
    expect(fail.body).toMatchObject({ claimToken: 'ct-1', message: 'solver exploded' });
    expect(calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'))).toBeUndefined();
  });

  it('fails a claimed run for an unknown service instead of dropping it', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: {},
      pollIntervalMs: 1,
      heartbeatIntervalMs: 100000,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(3, calls)
    });
    const fail = calls.find(call => call.url.endsWith('/api/tasks/run-1/fail'));
    expect(fail.body.message).toContain('no handler for service match');
  });

  it('heartbeats while a long handler runs', async () => {
    const calls = [];
    await runClaimExecutor({
      appUrl: 'http://app',
      token: 'connector-token',
      services: { match: () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 30)) },
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
      fetchImpl: mockPlatform({ calls }),
      signal: stopAfter(4, calls)
    });
    expect(calls.filter(call => call.url.endsWith('/api/tasks/run-1/heartbeat')).length).toBeGreaterThanOrEqual(1);
    expect(calls.find(call => call.url.endsWith('/api/tasks/run-1/complete'))).toBeTruthy();
  });

  it('requires appUrl and token', async () => {
    await expect(runClaimExecutor({ token: 't', services: {} })).rejects.toThrow(/appUrl/);
    await expect(runClaimExecutor({ appUrl: 'http://app', services: {} })).rejects.toThrow(/connector token/);
  });
});

describe('createPluginClient', () => {
  it('routes each command to its platform endpoint with the right credential', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => JSON.stringify({ pluginId: 'x', ok: true }) };
    };
    const client = createPluginClient({
      appUrl: 'http://app/',
      operatorToken: 'op-token',
      token: 'user-token',
      organizationId: 'org-9',
      fetchImpl
    });

    await client.publish({ pluginId: 'x' });
    await client.install('x');
    await client.connector('x');
    await client.saveSettings('x', { endpoints: { match: 'http://exec/match' }, authToken: 'k' });
    await client.invoke('x', 'match', { code: 'C' });

    const [publish, install, connector, settings, invoke] = calls;
    expect(publish.url).toBe('http://app/api/plugins/catalog');
    expect(publish.options.headers['x-operator-token']).toBe('op-token');
    expect(install.url).toBe('http://app/api/organizations/org-9/plugins');
    expect(install.options.headers.authorization).toBe('Bearer user-token');
    expect(connector.url).toContain('/plugins/x/connector');
    expect(settings.url).toContain('/plugins/x/settings');
    expect(settings.options.method).toBe('POST');
    expect(invoke.url).toBe('http://app/api/admin/commands/plugin.x.match/run');
    expect(JSON.parse(invoke.options.body)).toEqual({ parameters: { code: 'C' } });
  });

  it('names the missing credential instead of failing obscurely', async () => {
    const client = createPluginClient({ appUrl: 'http://app', fetchImpl: async () => { throw new Error('must not fetch'); } });
    await expect(client.publish({})).rejects.toThrow(/PERIGRAM_OPERATOR_TOKEN/);
    const orgScoped = createPluginClient({ appUrl: 'http://app', organizationId: 'org-1', fetchImpl: async () => { throw new Error('must not fetch'); } });
    await expect(orgScoped.install('x')).rejects.toThrow(/PERIGRAM_TOKEN/);
  });
});

// A stop signal that aborts once the mock platform has seen `target`
// requests, so each executor test observes exactly one claimed run.
function stopAfter(target, calls) {
  const controller = new AbortController();
  const tick = () => {
    if (calls.length >= target) controller.abort();
    else setImmediate(tick);
  };
  tick();
  return controller.signal;
}
