// Platform API client for the plugin authoring loop (every call maps to a
// documented platform route — see server/features/plugins/README.md):
// publish (operator token), install/connector/settings/test (user access
// token from POST /api/auth/login). Zero dependencies: global fetch.

export function createPluginClient({ appUrl, operatorToken = null, token = null, organizationId = null, fetchImpl = fetch } = {}) {
  if (!appUrl) throw new Error('createPluginClient requires appUrl');
  const base = String(appUrl).replace(/\/+$/, '');

  return {
    login: async ({ email, password }) => {
      const { accessToken } = await request(fetchImpl, `${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return accessToken;
    },

    publish: async listing => request(fetchImpl, `${base}/api/plugins/catalog`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-operator-token': requireValue(operatorToken, 'operator token (PERIGRAM_OPERATOR_TOKEN)')
      },
      body: JSON.stringify(listing)
    }),

    install: async pluginId => request(fetchImpl, `${base}/api/organizations/${encodeURIComponent(org(organizationId))}/plugins`, {
      method: 'POST',
      headers: authHeaders(token, { json: true }),
      body: JSON.stringify({ pluginId })
    }),

    connector: async pluginId => request(fetchImpl,
      `${base}/api/organizations/${encodeURIComponent(org(organizationId))}/plugins/${encodeURIComponent(pluginId)}/connector`,
      { headers: authHeaders(token) }),

    settings: async pluginId => request(fetchImpl,
      `${base}/api/organizations/${encodeURIComponent(org(organizationId))}/plugins/${encodeURIComponent(pluginId)}/settings`,
      { headers: authHeaders(token) }),

    saveSettings: async (pluginId, { endpoints = {}, authToken = null }) => request(fetchImpl,
      `${base}/api/organizations/${encodeURIComponent(org(organizationId))}/plugins/${encodeURIComponent(pluginId)}/settings`, {
        method: 'POST',
        headers: authHeaders(token, { json: true }),
        body: JSON.stringify({ endpoints, authToken })
      }),

    // Execute an installed service through the command runtime
    // (POST /api/admin/commands/:id/run): endpoint-mode services answer
    // with their output; claim-mode services return the enqueued run.
    invoke: async (pluginId, serviceId, input) => request(fetchImpl,
      `${base}/api/admin/commands/${encodeURIComponent(`plugin.${pluginId}.${serviceId}`)}/run`, {
        method: 'POST',
        headers: authHeaders(token, { json: true }),
        body: JSON.stringify({ parameters: input ?? null })
      })
  };
}

function authHeaders(token, { json = false } = {}) {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    authorization: `Bearer ${requireValue(token, 'access token (PERIGRAM_TOKEN — see login)')}`
  };
}

function org(organizationId) {
  return requireValue(organizationId, 'organization id (PERIGRAM_ORG_ID)');
}

function requireValue(value, what) {
  if (!value) throw new Error(`Missing ${what}`);
  return value;
}

async function request(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new Error(`${url} unreachable: ${error?.message || error}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}
