import { connectDB } from '../../db/mongo.js';
import { createHash } from 'node:crypto';
import { findFileMetaByFilename, getFileBuffer, listFileMetasWhere, uploadFile, deleteFile } from '../files/service.js';

// Catalog listings are platform-published (the central-catalog decision,
// SPEC §Plugin marketplace); installs are per-org pinned snapshots of the
// listing's declarations — the pin is the data, so catalog changes never
// reach an installed organization until it upgrades.

const CATALOG_COLLECTION = 'plugin_catalog';
const INSTALLS_COLLECTION = 'plugin_installs';
const SERVICE_CACHE_COLLECTION = 'plugin_service_cache';

// Client-carried packages (SPEC §20): a plugin's engine modules and
// runtime assets ship in the `plugin_assets` GridFS bucket, keyed
// `pluginId/version/path` — the filename is the lookup key and the
// metadata carries the pieces for retraction cleanup.
export const PLUGIN_ASSETS_BUCKET = 'plugin_assets';
export const ORG_PLUGIN_ASSETS_BUCKET = 'org_plugin_assets';

const assetFilename = (pluginId, version, path) => `${pluginId}/${version}/${path}`;
const organizationAssetFilename = (organizationId, pluginId, version, path) => `${organizationId}/${pluginId}/${version}/${path}`;

export async function storePluginAsset({ pluginId, version, path, buffer, contentType = '' }) {
  const filename = assetFilename(pluginId, version, path);
  const existing = await findFileMetaByFilename(filename, PLUGIN_ASSETS_BUCKET);
  if (existing) await deleteFile(existing.id, PLUGIN_ASSETS_BUCKET);
  const stored = await uploadFile(buffer, filename, { pluginId, version, path }, PLUGIN_ASSETS_BUCKET, contentType);
  return { pluginId, version, path, id: stored.id, bytes: buffer.length };
}

export async function findPluginAssetMeta(pluginId, version, path) {
  const meta = await findFileMetaByFilename(assetFilename(pluginId, version, path), PLUGIN_ASSETS_BUCKET);
  if (!meta) return null;
  return {
    id: meta.id,
    contentType: meta.contentType || meta.metadata?.mimeType || '',
    contentHash: meta.metadata?.contentHash || ''
  };
}

export async function readPluginAsset(assetMeta) {
  return await getFileBuffer(assetMeta.id, PLUGIN_ASSETS_BUCKET);
}

export async function deletePluginAssets(pluginId) {
  const metas = await listFileMetasWhere(PLUGIN_ASSETS_BUCKET, { 'metadata.pluginId': String(pluginId) });
  for (const meta of metas) await deleteFile(meta.id, PLUGIN_ASSETS_BUCKET);
  return metas.length;
}

// Installed package assets are organization data (SPEC §20, owner
// direction 2026-11-16). Catalog assets remain the distribution source;
// install materializes the pinned release into an organization-scoped
// bucket so runtime reads do not depend on a publisher/executor origin.
export async function materializePluginAssets(organizationId, pluginId, version) {
  const sourceMetas = await listFileMetasWhere(PLUGIN_ASSETS_BUCKET, {
    'metadata.pluginId': String(pluginId),
    'metadata.version': String(version)
  });
  const copied = [];
  try {
    for (const source of sourceMetas) {
      const path = String(source.metadata?.path || '');
      if (!path) continue;
      const filename = organizationAssetFilename(organizationId, pluginId, version, path);
      const existing = await findFileMetaByFilename(filename, ORG_PLUGIN_ASSETS_BUCKET);
      // Hash the bytes actually copied, not publisher-supplied metadata. The
      // installed manifest is later checked against the bytes on every read.
      const buffer = await getFileBuffer(source.id, PLUGIN_ASSETS_BUCKET);
      const contentHash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
      if (existing) {
        const existingBuffer = await getFileBuffer(existing.id, ORG_PLUGIN_ASSETS_BUCKET);
        const existingDigest = `sha256:${createHash('sha256').update(existingBuffer).digest('hex')}`;
        if (String(existing.metadata?.contentHash || '') === contentHash && existingDigest === contentHash) {
          copied.push({ path, contentHash, bytes: existingBuffer.length });
          continue;
        }
        await deleteFile(existing.id, ORG_PLUGIN_ASSETS_BUCKET);
      }
      await uploadFile(buffer, filename, {
        organizationId: String(organizationId),
        pluginId: String(pluginId),
        version: String(version),
        path,
        contentHash
      }, ORG_PLUGIN_ASSETS_BUCKET, source.contentType || '');
      copied.push({ path, contentHash, bytes: buffer.length });
    }
    return { count: copied.length, assets: copied };
  } catch (error) {
    await deleteOrganizationPluginAssets(organizationId, pluginId, version);
    throw error;
  }
}

export async function findOrganizationPluginAssetMeta(organizationId, pluginId, version, path) {
  const filename = organizationAssetFilename(organizationId, pluginId, version, path);
  const meta = await findFileMetaByFilename(filename, ORG_PLUGIN_ASSETS_BUCKET);
  if (!meta) return null;
  return {
    id: meta.id,
    contentType: meta.contentType || meta.metadata?.mimeType || '',
    contentHash: meta.metadata?.contentHash || ''
  };
}

export async function readOrganizationPluginAsset(assetMeta) {
  return await getFileBuffer(assetMeta.id, ORG_PLUGIN_ASSETS_BUCKET);
}

export async function deleteOrganizationPluginAssets(organizationId, pluginId, version = null) {
  const filter = {
    'metadata.organizationId': String(organizationId),
    'metadata.pluginId': String(pluginId)
  };
  if (version != null) filter['metadata.version'] = String(version);
  const metas = await listFileMetasWhere(ORG_PLUGIN_ASSETS_BUCKET, filter);
  for (const meta of metas) await deleteFile(meta.id, ORG_PLUGIN_ASSETS_BUCKET);
  return metas.length;
}

// Deterministic pure-service results (SPEC §28 artifact contract): the
// cache key hashes the service identity, its install version, and the
// canonical input value — a hit must reproduce the executor's own output
// byte-for-byte, so only a service declaring `cache: 'deterministic'`
// ever lands here.
export async function findCachedServiceResult(cacheKey) {
  const db = await connectDB();
  return await db.collection(SERVICE_CACHE_COLLECTION).findOne({ _id: cacheKey });
}

export async function storeCachedServiceResult(cacheKey, result) {
  const db = await connectDB();
  await db.collection(SERVICE_CACHE_COLLECTION).updateOne(
    { _id: cacheKey },
    { $set: { result, cachedAt: new Date() } },
    { upsert: true }
  );
}

export async function listCatalog() {
  const db = await connectDB();
  return await db.collection(CATALOG_COLLECTION)
    .find({})
    .sort({ name: 1 })
    .toArray();
}

export async function findCatalogByPluginId(pluginId) {
  const db = await connectDB();
  if (!pluginId) return null;
  return await db.collection(CATALOG_COLLECTION).findOne({ pluginId: String(pluginId) });
}

export async function upsertCatalogListing(listing) {
  const db = await connectDB();
  await db.collection(CATALOG_COLLECTION).updateOne(
    { pluginId: String(listing.pluginId) },
    { $set: { ...listing, pluginId: String(listing.pluginId), publishedAt: new Date() } },
    { upsert: true }
  );
}

export async function deleteCatalogListing(pluginId) {
  const db = await connectDB();
  await db.collection(CATALOG_COLLECTION).deleteOne({ pluginId: String(pluginId) });
}

export async function countInstallsByPluginId(pluginId) {
  const db = await connectDB();
  return await db.collection(INSTALLS_COLLECTION).countDocuments({ pluginId: String(pluginId) });
}

export async function listInstallsByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(INSTALLS_COLLECTION)
    .find({ organizationId: String(organizationId) })
    .sort({ installedAt: -1 })
    .toArray();
}

export async function findInstall(organizationId, pluginId) {
  const db = await connectDB();
  if (!pluginId) return null;
  return await db.collection(INSTALLS_COLLECTION).findOne({
    organizationId: String(organizationId),
    pluginId: String(pluginId)
  });
}

export async function findInstallByConnectorToken(token) {
  const db = await connectDB();
  if (!token) return null;
  return await db.collection(INSTALLS_COLLECTION).findOne({ connectorToken: String(token) });
}

export async function setConnectorToken(organizationId, pluginId, connectorToken) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).updateOne(
    { organizationId: String(organizationId), pluginId: String(pluginId) },
    { $set: { connectorToken, tokenRotatedAt: new Date() } }
  );
}

export async function createInstall(install) {
  const db = await connectDB();
  const result = await db.collection(INSTALLS_COLLECTION).insertOne({
    ...install,
    organizationId: String(install.organizationId),
    pluginId: String(install.pluginId),
    installedAt: new Date()
  });
  return result.insertedId;
}

export async function deleteInstall(organizationId, pluginId) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).deleteOne({
    organizationId: String(organizationId),
    pluginId: String(pluginId)
  });
}

// Upgrade apply: replace the pinned snapshot (declarations, services,
// pack requirements, and provider-level executor origin; the connector
// token survives).
export async function updateInstallSnapshot(organizationId, pluginId, { version, declarations, services, requires = [], executorOrigin = undefined, packageAssets = null }) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).updateOne(
    { organizationId: String(organizationId), pluginId: String(pluginId) },
    { $set: { version, declarations, services: services || [], requires, ...(executorOrigin !== undefined ? { executorOrigin } : {}), ...(packageAssets ? { packageAssets, assetStorage: { kind: 'organization', materializedAt: new Date() } } : {}), upgradedAt: new Date() } }
  );
}

// Connection settings: one provider-level executor origin and credential.
export async function updateSettings(organizationId, pluginId, { executorOrigin, authToken, surfaceOrigin }) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).updateOne(
    { organizationId: String(organizationId), pluginId: String(pluginId) },
    { $set: { executorOrigin: executorOrigin || null, authToken, surfaceOrigin: surfaceOrigin || null }, $unset: { endpoints: '' } }
  );
}

// The composed plugin layer for the org view (cts-types composition): the
// installed snapshots' type declarations, install order. Upgrade trials
// exclude the upgrading plugin's own layer.
export async function listDeclarationsByOrganization(organizationId, { excludePluginId = null } = {}) {
  const installs = await listInstallsByOrganization(organizationId);
  return installs
    .filter(install => String(install.pluginId) !== String(excludePluginId))
    .flatMap(install => install.declarations?.types || []);
}

export async function findDeclarationByTypeId(organizationId, typeId) {
  const db = await connectDB();
  if (!typeId) return null;
  const install = await db.collection(INSTALLS_COLLECTION).findOne({
    organizationId: String(organizationId),
    'declarations.types.id': String(typeId)
  });
  return (install?.declarations?.types || []).find(type => type.id === String(typeId)) || null;
}
