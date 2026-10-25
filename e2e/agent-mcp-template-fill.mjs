// API-only E2E: the assistant's MCP tool surface authors, activates, and
// runs a template-fill process definition, then reads the created file
// back. Run against a live stack: `node e2e/agent-mcp-template-fill.mjs`
// (E2E_BASE_URL, default http://localhost:3000). Exits non-zero on any
// failed step; the final artifact is the filled markdown text.
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const email = `mcp-fill-${Date.now()}@perigram.local`;
const password = 'McpFillProbe#2026';
let cookie = '';

async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000)
  });
  // Only the auth session cookie travels: login binds the session to the
  // tracking cookie presented at login, and org-create rotates that one.
  const session = res.headers.getSetCookie().map(raw => raw.split(';')[0]).find(pair => pair.startsWith('sessionId='));
  if (session) cookie = session;
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${String(text).slice(0, 300)}`);
  return json;
}

let rpcId = 0;
const mcp = (method, params = {}) => api('/api/mcp', 'POST', { jsonrpc: '2.0', id: ++rpcId, method, params });

async function call(name, args) {
  const result = (await mcp('tools/call', { name, arguments: args })).result;
  if (result?.isError) throw new Error(`${name}: ${JSON.stringify(result.content).slice(0, 500)}`);
  const text = (result?.content || []).map(part => part.text ?? '').join('\n');
  try { return JSON.parse(text); } catch { return text; }
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };

// --- scratch identity, org, and the documents plugin (the text-document type) ---
await api('/api/auth/register', 'POST', { name: 'MCP Fill Probe', email, password });
await api('/api/auth/login', 'POST', { email, password });
await api('/api/organizations', 'POST', { name: 'MCP Fill Probe Org' });
const me = await api('/api/auth/me');
await api(`/api/organizations/${me.organizationId}/plugins`, 'POST', { pluginId: 'documents' });

// --- the MCP surface ---
const tools = (await mcp('tools/list')).result.tools.map(tool => tool.name);
assert(tools.includes('read_instance_file'), 'read_instance_file missing from MCP tools');
assert(!tools.includes('read_attachment'), 'chat-only read_attachment leaked into MCP tools');

// --- authoring: a bare create seeds the empty current-protocol draft ---
const bare = await call('create_process_definition', { name: 'Bare probe draft' });
assert(Number(bare.data?.dataflowVersion) === 4, `bare create did not seed a v4 draft: ${JSON.stringify(bare).slice(0, 200)}`);

// --- authoring: the template fill graph through designer gestures ---
const vocab = await call('get_authoring_vocabulary', {});
const roleId = vocab.roles?.[0]?.id;
assert(roleId, 'no organization role to grant the construct lane');

const composed = await call('compose_process_definition', {
  name: 'Passport fill',
  steps: [
    { op: 'drop', item: 'literalList', id: 'src' },
    { op: 'configure', id: 'src', values: { type: { base: 'record', nullable: false }, value: [{ project: 'Demo Facade', code: 'E-219' }] } },
    { op: 'drop', item: 'formatValue', id: 'fmt' },
    { op: 'configure', id: 'fmt', values: { template: '# Cutting pass — {project}\n\nOrder code: {code}\n', outputType: { base: 'string', nullable: false } } },
    { op: 'drop', item: 'construct', id: 'fill' },
    { op: 'configure', id: 'fill', values: { typeId: 'text-document', construction: { mode: 'content' } } },
    { op: 'configure', id: 'fill', values: { access: { grants: [{ roleId, level: 'write' }] } } },
    { op: 'connect', id: 'src', fromPort: 'value', to: 'fmt', toPort: 'record' },
    { op: 'connect', id: 'fmt', fromPort: 'value', to: 'fill', toPort: 'content' }
  ]
});
const definitionId = composed.id || composed._id;

const digest = await call('get_process_definition', { definitionId });
assert(digest.edges.some(edge => edge.from === 'fmt:value' && edge.to === 'fill:content'), 'format->content edge missing from digest');

const validation = await call('validate_process_definition', { definitionId });
assert(!(validation.errors || []).length, `validation errors: ${JSON.stringify(validation.errors)}`);
await call('activate_process_definition', { definitionId });

// --- execution: run the compiled fill action, read the file back ---
const actions = await call('list_actions', {});
const fill = actions.find(action => action.typeId === 'text-document' && action.construction?.mode === 'content');
assert(fill, `no text-document content action in manifest: ${JSON.stringify(actions.map(a => a.id))}`);
assert(fill.inputPolicy, 'manifest action carries no input policy');

const run = await call('run_action', { actionId: fill.id, data: {} });
const instanceId = (run.created || run.instance || run)._id;
const row = await call('get_instance', { type: 'text-document', id: instanceId });
assert(row.payload?.fileId, 'created instance carries no payload reference');

const file = await call('read_instance_file', { type: 'text-document', id: instanceId });
const expected = '# Cutting pass — Demo Facade\n\nOrder code: E-219\n';
assert(file.text === expected, `unexpected filled content: ${JSON.stringify(file.text)}`);

console.log(`definition ${definitionId} activated`);
console.log(`instance ${instanceId} (${file.name}, ${file.mimeType}, ${file.size} bytes)`);
console.log('--- filled markdown ---');
console.log(file.text);
