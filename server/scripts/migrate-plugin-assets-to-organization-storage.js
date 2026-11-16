// One-time, idempotent migration for installed plugin pins (SPEC §20).
//
// Copies each installed version from the platform catalog asset bucket into
// its organization-owned bucket, verifies every declared package entrypoint,
// and records the immutable manifest on the install pin. Run from the app
// container after the organization-owned asset reader is deployed:
//
//   docker compose -f docker-compose.dev.yml exec app node server/scripts/migrate-plugin-assets-to-organization-storage.js
//
// Missing source assets leave the pin unmarked so the operator can repair
// the release and safely rerun this migration. Catalog assets are not deleted.
import { connectDB } from '../db/mongo.js';
import {
  listInstallsByOrganization,
  materializePluginAssets,
  findOrganizationPluginAssetMeta
} from '../features/plugins/repository.js';

const db = await connectDB();
const organizations = await db.collection('organizations')
  .find({}, { projection: { _id: 1 } })
  .toArray();

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const organization of organizations) {
  const organizationId = String(organization._id);
  const installs = await listInstallsByOrganization(organizationId);
  for (const install of installs) {
    if (install.assetStorage?.kind === 'organization' && install.packageAssets?.assets) {
      skipped += 1;
      continue;
    }

    const version = String(install.version || '1');
    const declarations = install.declarations || {};
    const requiredPaths = new Set([
      ...(declarations.runtimes || []).map(runtime => runtime.entry),
      ...(declarations.engine?.module ? [declarations.engine.module] : []),
      ...(declarations.surfaces || []).map(surface => surface.module),
      ...(declarations.dependencies || []).map(dependency => dependency.module).filter(path => path?.startsWith('/'))
    ].filter(Boolean).map(path => String(path).replace(/^\//, '')));

    try {
      const manifest = await materializePluginAssets(organizationId, install.pluginId, version);
      const missing = [];
      for (const path of requiredPaths) {
        const asset = await findOrganizationPluginAssetMeta(organizationId, install.pluginId, version, path);
        if (!asset) missing.push(path);
      }
      if (missing.length) throw new Error('required package assets are absent: ' + missing.join(', '));
      if (requiredPaths.size && manifest.count === 0) {
        throw new Error('the pinned release has required assets but no catalog assets were copied');
      }

      await db.collection('plugin_installs').updateOne(
        { _id: install._id, organizationId, pluginId: String(install.pluginId), version },
        { $set: {
          packageAssets: manifest,
          assetStorage: { kind: 'organization', migratedAt: new Date() }
        } }
      );
      migrated += 1;
      console.log('migrated ' + organizationId + '/' + install.pluginId + '@' + version + ': ' + manifest.count + ' asset(s)');
    } catch (error) {
      failed += 1;
      console.error('FAILED ' + organizationId + '/' + install.pluginId + '@' + version + ': ' + (error?.message || error));
    }
  }
}

console.log('plugin asset migration complete: ' + migrated + ' migrated, ' + skipped + ' already migrated, ' + failed + ' failed');
if (failed) process.exitCode = 1;
else process.exit(0);
