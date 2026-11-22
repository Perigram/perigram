// One-time, idempotent migration for installed plugin pins (SPEC §20).
//
// Copies each installed version from the platform catalog asset bucket into
// its organization-owned bucket, verifies every declared package entrypoint
// and every manifest digest against the stored bytes, and records the
// immutable manifest on the install pin. Run from the app container after
// the organization-owned asset reader is deployed:
//
//   docker compose -f docker-compose.dev.yml exec app node server/scripts/migrate-plugin-assets-to-organization-storage.js
//
// Missing or corrupt source assets leave the pin unmarked so the operator
// can repair the release and safely rerun this migration. Catalog assets are
// not deleted.
import { connectDB } from '../db/mongo.js';
import { contentHash } from '../features/files/service.js';
import {
  listInstallsByOrganization,
  materializePluginAssets,
  findOrganizationPluginAssetMeta,
  readOrganizationPluginAsset
} from '../features/plugins/repository.js';

const db = await connectDB();
const organizations = await db.collection('organizations')
  .find({}, { projection: { _id: 1 } })
  .toArray();

let migrated = 0;
let skipped = 0;
let missing = 0;
let failed = 0;

function requiredAssetPaths(declarations) {
  return new Set([
    ...(declarations.runtimes || []).map(runtime => runtime.entry),
    ...(declarations.engine?.module ? [declarations.engine.module] : []),
    ...(declarations.surfaces || []).map(surface => surface.module),
    ...(declarations.dependencies || []).map(dependency => dependency.module).filter(path => path?.startsWith('/'))
  ].filter(Boolean).map(path => String(path).replace(/^\//, '')));
}

async function verifyManifest(organizationId, pluginId, version, manifest, requiredPaths) {
  if (!manifest || !Array.isArray(manifest.assets)) return false;
  const byPath = new Map(manifest.assets.map(asset => [String(asset.path), asset]));
  for (const path of requiredPaths) {
    if (!byPath.has(path)) return false;
  }
  for (const asset of manifest.assets) {
    if (!asset.path || !asset.contentHash) return false;
    const stored = await findOrganizationPluginAssetMeta(organizationId, pluginId, version, asset.path);
    if (!stored?.id || stored.contentHash !== asset.contentHash) return false;
    const bytes = await readOrganizationPluginAsset(stored);
    if (contentHash(bytes) !== asset.contentHash) return false;
  }
  return true;
}

for (const organization of organizations) {
  const organizationId = String(organization._id);
  const installs = await listInstallsByOrganization(organizationId);
  for (const install of installs) {
    const pluginId = String(install.pluginId);
    const version = String(install.version || '1');
    const requiredPaths = requiredAssetPaths(install.declarations || {});

    try {
      if (install.assetStorage?.kind === 'organization'
        && await verifyManifest(organizationId, pluginId, version, install.packageAssets, requiredPaths)) {
        skipped += 1;
        continue;
      }

      const manifest = await materializePluginAssets(organizationId, pluginId, version);
      if (requiredPaths.size && manifest.count === 0) {
        missing += 1;
        console.log('missing catalog release ' + organizationId + '/' + pluginId + '@' + version);
        continue;
      }
      const valid = await verifyManifest(organizationId, pluginId, version, manifest, requiredPaths);
      if (!valid) {
        throw new Error('copied package manifest is incomplete or its stored bytes do not match their digests');
      }
      if (requiredPaths.size && manifest.count === 0) {
        throw new Error('the pinned release has required assets but no catalog assets were copied');
      }

      const result = await db.collection('plugin_installs').updateOne(
        { _id: install._id, organizationId, pluginId, version },
        { $set: {
          packageAssets: manifest,
          assetStorage: { kind: 'organization', migratedAt: new Date() }
        } }
      );
      if (result.matchedCount !== 1) {
        throw new Error('install pin changed during migration; rerun after resolving the concurrent update');
      }
      migrated += 1;
      console.log('migrated ' + organizationId + '/' + pluginId + '@' + version + ': ' + manifest.count + ' asset(s)');
    } catch (error) {
      // A failed repair may have removed a previously materialized copy.
      // Clear only the exact snapshot we inspected so runtime falls back to
      // catalog distribution assets instead of trusting a now-incomplete
      // organization manifest. A concurrent install/upgrade is left alone.
      const unchangedPin = { _id: install._id, organizationId, pluginId, version };
      unchangedPin.assetStorage = Object.hasOwn(install, 'assetStorage')
        ? install.assetStorage
        : { $exists: false };
      unchangedPin.packageAssets = Object.hasOwn(install, 'packageAssets')
        ? install.packageAssets
        : { $exists: false };
      try {
        const reset = await db.collection('plugin_installs').updateOne(
          unchangedPin,
          { $unset: { packageAssets: '', assetStorage: '' } }
        );
        if (reset.matchedCount !== 1) {
          console.error('Could not restore catalog fallback because the install pin changed during migration');
        }
      } catch (resetError) {
        console.error('Could not clear the incomplete organization asset marker: ' + (resetError?.message || resetError));
      }
      failed += 1;
      console.error('FAILED ' + organizationId + '/' + pluginId + '@' + version + ': ' + (error?.message || error));
    }
  }
}

console.log('plugin asset migration complete: ' + migrated + ' migrated, ' + skipped + ' already migrated, ' + missing + ' missing catalog release, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
