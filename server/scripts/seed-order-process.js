// Seeds the facade pack's composed order process into a real
// organization through the platform's own APIs: the org type
// declarations (the order container + its table relation, the nesting
// attempt record), the process definition (the fixture's authored
// graph), and activation — the same draft/activate path the designer's
// Apply runs. After seeding, the definition opens in the process
// designer and its compiled screens/actions serve the org.
//
// Usage (inside the dev container or against a running app):
//   node server/scripts/seed-order-process.js \
//     --email <admin email> --password <password> [--url http://localhost:3000]
// Environment equivalents: SEED_EMAIL, SEED_PASSWORD, SEED_URL.
import { orderOrgTypeDeclarations, orderProcessDefinition } from '../packs/facade/order-process-fixture.js';

function flagValue(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env[`SEED_${name.toUpperCase()}`] || fallback;
}

const baseUrl = flagValue('url', 'http://localhost:3000').replace(/\/$/, '');
const email = flagValue('email');
const password = flagValue('password');
if (!email || !password) {
  console.error('Required: --email and --password (or SEED_EMAIL / SEED_PASSWORD) of an organization admin.');
  process.exit(1);
}
const PROCESS_NAME = 'Facade order process';

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

async function main() {
  const login = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  const token = login.accessToken;
  console.log(`Signed in as ${login.user?.identity?.name || login.user?.email || email}`);

  // The fixture authors grants against the test vocabulary role
  // (`role_admin`); a definition seeded into a live org must carry that
  // org's real admin role id.
  const organizationId = login.user?.lineage?.organizationId || login.user?.organizationId;
  if (!organizationId) throw new Error('Login context carries no organization — switch into the target org first');
  const org = await call(`/api/organizations/${organizationId}`, { token });
  const roles = Object.values(org?.data?.roles || {});
  if (!roles.length) throw new Error(`Organization ${organizationId} declares no roles`);
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  console.log(`Admin role: ${adminRole.id} (${adminRole.label})`);

  for (const declaration of orderOrgTypeDeclarations()) {
    await call('/api/admin/cts/types', { method: 'POST', body: declaration, token });
    console.log(`Declared org type ${declaration.id}`);
  }

  const definition = orderProcessDefinition();
  for (const node of Object.values(definition.processNodes || {})) {
    for (const grant of node.access?.grants || []) {
      if (grant.roleId === 'role_admin') grant.roleId = adminRole.id;
    }
  }

  const existing = await call('/api/process-definitions', { token });
  const prior = (Array.isArray(existing) ? existing : existing?.items || [])
    .find(item => item?.identity?.name === PROCESS_NAME || item?.name === PROCESS_NAME);
  const payload = { name: PROCESS_NAME, data: definition };

  let definitionId;
  if (prior?._id) {
    await call(`/api/process-definitions/${prior._id}`, { method: 'PATCH', body: payload, token });
    definitionId = prior._id;
    console.log(`Updated existing definition ${definitionId}`);
  } else {
    const created = await call('/api/process-definitions', { method: 'POST', body: payload, token });
    definitionId = created?._id || created?.id || created?.definition?._id;
    console.log(`Created definition ${definitionId}`);
  }
  if (!definitionId) throw new Error('Definition id missing from create response');

  await call(`/api/process-definitions/${definitionId}/validate`, { method: 'POST', token });
  const active = await call(`/api/process-definitions/${definitionId}/activate`, { method: 'POST', token });
  console.log(`Activated: ${active?.status?.state || 'ACTIVE'}`);
  console.log('\nOpen the process designer — the definition is there.');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
