import { connectDB } from '~/server/db/mongo';

// Catalog listings are platform-published (the central-catalog decision,
// SPEC §Plugin marketplace); installs are per-org pinned snapshots of the
// listing's declarations — the pin is the data, so catalog changes never
// reach an installed organization until it upgrades.

const CATALOG_COLLECTION = 'plugin_catalog';
const INSTALLS_COLLECTION = 'plugin_installs';

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

// Upgrade apply: replace the pinned snapshot (declarations, services, and
// pack requirements are the pin; the connector token survives).
export async function updateInstallSnapshot(organizationId, pluginId, { version, declarations, services, requires = [] }) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).updateOne(
    { organizationId: String(organizationId), pluginId: String(pluginId) },
    { $set: { version, declarations, services: services || [], requires, upgradedAt: new Date() } }
  );
}

// Connection settings: per-service endpoints and the executor API key.
export async function updateSettings(organizationId, pluginId, { endpoints, authToken, surfaceOrigin }) {
  const db = await connectDB();
  await db.collection(INSTALLS_COLLECTION).updateOne(
    { organizationId: String(organizationId), pluginId: String(pluginId) },
    { $set: { endpoints, authToken, surfaceOrigin: surfaceOrigin || null } }
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
