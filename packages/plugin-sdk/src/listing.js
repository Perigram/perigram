// Plugin listing contract (SPEC §Plugin marketplace): the one parser and
// validator for what a catalog listing may declare. Imported by the
// platform's install gate and publish API, and by plugin authors through
// this package — the published shape and the installable shape can never
// drift. Pure: no storage, no platform imports, runs in Node and browsers.
//
// A listing carries beside its types:
// - `services` — SPEC §8 V-grammar signatures bound to external executors
//   (endpoint/claim mode);
// - `editors` — file-type editor bindings (the same records packs declare);
// - `attachmentKinds` — payload upload contracts (pack vocabulary);
// - `conversions` — artifact conversion entries (data only; a `service`
//   binding names the plugin service that executes the conversion);
// - `constructions` — construction modes of the plugin's own types bound to
//   plugin services: `{ '<typeId>': { '<mode>': '<service ref>' } }`;
// - `exports` — attachment exports bound to plugin services:
//   `[{ typeId, kind, service, extension?, mime? }]`;
// - `surfaces` — plugin-delivered editor surface modules (owner decision
//   2026-10-11): `[{ id, module, surfaceContract }]` where `module` is a
//   root-relative path the plugin's executor serves and
//   `surfaceContract` is the mount-contract major the module targets;
// - `requires` — mounted pack ids the plugin's types resolve against.

const SERVICE_REF = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;
const MODULE_PATH = /^\/[a-z0-9/_-]+\.m?js$/;

export function parseListing(listing = {}) {
  const declarations = listing.declarations || {};
  const types = declarations.types || [];
  const services = (declarations.services || []).filter(service => service?.id && service?.signature);
  const editors = declarations.editors || [];
  const attachmentKinds = declarations.attachmentKinds || {};
  const conversions = declarations.conversions || [];
  const constructions = declarations.constructions || {};
  const exportsList = declarations.exports || [];
  const surfaces = (declarations.surfaces || []).filter(Boolean);
  const requires = Array.isArray(listing.requires) ? listing.requires.map(String) : [];
  const pluginId = String(listing.pluginId || '');

  if (!pluginId || !/^[a-z0-9-]+$/.test(pluginId)) {
    throw listingError(`pluginId must be a slug (got ${JSON.stringify(pluginId)})`);
  }
  if (!Array.isArray(types) || !types.length) {
    throw listingError('declarations.types must be a non-empty array');
  }
  for (const type of types) {
    if (!type?.id || !type?.class) {
      throw listingError(`every type needs id and class (got ${JSON.stringify(type?.id)})`);
    }
  }

  for (const service of services) {
    if (!/^[a-z0-9-]+$/.test(service.id || '')) {
      throw listingError(`service id must be a slug (got ${JSON.stringify(service.id)})`);
    }
    if (!service.signature?.input || !service.signature?.output) {
      throw listingError(`service ${service.id} needs a signature with input and output`);
    }
    if (service.mode && !['endpoint', 'claim'].includes(service.mode)) {
      throw listingError(`service ${service.id} mode must be 'endpoint' or 'claim'`);
    }
  }
  const serviceIds = new Set(services.map(service => service.id));
  const serviceRefOf = (ref, what) => {
    const match = String(ref || '').match(SERVICE_REF);
    if (!match) {
      throw listingError(`${what} must be a plugin-qualified service ref plugin.<pluginId>.<serviceId> (got ${JSON.stringify(ref)})`);
    }
    if (match[1] !== pluginId) {
      throw listingError(`${what} names plugin ${match[1]}, but this listing is ${pluginId}`);
    }
    if (!serviceIds.has(match[2])) {
      throw listingError(`${what} references service ${match[2]}, which the plugin does not declare`);
    }
    return String(ref);
  };

  const typeById = new Map(types.map(type => [type.id, type]));
  const constructModesOf = type => new Set([
    ...Object.values(type?.operators || {})
      .filter(operator => operator?.species === 'construct')
      .map(operator => operator.id),
    ...(type?.payload?.creation || ['upload']).map(String)
  ]);
  const seenEditorTypes = new Set();
  for (const editor of editors) {
    if (!editor?.type || !editor?.surface || !(editor.modes || []).length) {
      throw listingError(`malformed editor binding: ${JSON.stringify(editor)}`);
    }
    const declaration = typeById.get(editor.type);
    if (!declaration) {
      throw listingError(`editor binding for type ${editor.type} must reference a type this plugin declares`);
    }
    if (declaration.class !== 'file') {
      throw listingError(`editor binding for type ${editor.type} of class ${declaration.class} requires a file type`);
    }
    if (seenEditorTypes.has(editor.type)) {
      throw listingError(`duplicate editor binding for type ${editor.type} — exactly one editor per file type`);
    }
    seenEditorTypes.add(editor.type);
  }

  for (const [kind, contract] of Object.entries(attachmentKinds)) {
    if (!kind || typeof contract !== 'object' || Array.isArray(contract) || !contract) {
      throw listingError(`attachment kind ${kind || '(empty id)'} must map to a contract object`);
    }
  }

  const seenConversionIds = new Set();
  for (const conversion of conversions) {
    if (!conversion?.id || typeof conversion.id !== 'string') {
      throw listingError(`every conversion needs an id (got ${JSON.stringify(conversion?.id)})`);
    }
    if (seenConversionIds.has(conversion.id)) {
      throw listingError(`duplicate conversion id ${conversion.id}`);
    }
    seenConversionIds.add(conversion.id);
    if (!Array.isArray(conversion.sourceKinds) || !conversion.sourceKinds.length) {
      throw listingError(`conversion ${conversion.id} needs a non-empty sourceKinds array`);
    }
    if (!conversion.target || typeof conversion.target !== 'object') {
      throw listingError(`conversion ${conversion.id} needs a target`);
    }
    if (conversion.service !== undefined) {
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(String(conversion.service))) {
        throw listingError(`conversion ${conversion.id} service must be a plugin service reference (got ${JSON.stringify(conversion.service)})`);
      }
      const bare = String(conversion.service).split('.').length === 1;
      if (bare && !serviceIds.has(conversion.service)) {
        throw listingError(`conversion ${conversion.id} references service ${conversion.service}, which the plugin does not declare`);
      }
    }
  }

  for (const [typeId, modes] of Object.entries(constructions)) {
    const declaration = typeById.get(typeId);
    if (!declaration) {
      throw listingError(`construction binding for type ${typeId} must reference a type this plugin declares`);
    }
    if (!modes || typeof modes !== 'object' || Array.isArray(modes) || !Object.keys(modes).length) {
      throw listingError(`construction binding for type ${typeId} must map modes to service refs`);
    }
    const available = constructModesOf(declaration);
    for (const [mode, ref] of Object.entries(modes)) {
      if (!available.has(mode)) {
        throw listingError(`construction binding for ${typeId}.${mode} names a mode the type does not declare`);
      }
      serviceRefOf(ref, `construction ${typeId}.${mode}`);
    }
  }

  for (const exporter of exportsList) {
    if (!exporter?.typeId || !exporter?.kind) {
      throw listingError(`every export needs typeId and kind (got ${JSON.stringify(exporter?.typeId)})`);
    }
    if (!typeById.has(exporter.typeId)) {
      throw listingError(`export for type ${exporter.typeId} must reference a type this plugin declares`);
    }
    serviceRefOf(exporter.service, `export ${exporter.typeId}/${exporter.kind}`);
  }

  const seenSurfaceIds = new Set();
  for (const surface of surfaces) {
    if (!/^[a-z0-9-]+$/.test(surface.id || '')) {
      throw listingError(`surface id must be a slug (got ${JSON.stringify(surface.id)})`);
    }
    if (seenSurfaceIds.has(surface.id)) {
      throw listingError(`duplicate surface id ${surface.id}`);
    }
    seenSurfaceIds.add(surface.id);
    if (!MODULE_PATH.test(String(surface.module || ''))) {
      throw listingError(`surface ${surface.id} module must be a root-relative .js/.mjs path the executor serves (got ${JSON.stringify(surface.module)})`);
    }
    if (!Number.isInteger(surface.surfaceContract) || surface.surfaceContract < 1) {
      throw listingError(`surface ${surface.id} needs an integer surfaceContract >= 1 (got ${JSON.stringify(surface.surfaceContract)})`);
    }
  }

  for (const packId of requires) {
    if (!/^[a-z0-9-]+$/.test(packId)) {
      throw listingError(`requires entries must be pack slugs (got ${JSON.stringify(packId)})`);
    }
  }

  return { pluginId, types, services, editors, attachmentKinds, conversions, constructions, exports: exportsList, surfaces, requires };
}

// The normalized catalog document the publish API stores and installs
// snapshot: parseListing's layer plus the listing's identity fields.
export function normalizeListing(listing = {}) {
  const layer = parseListing(listing);
  return {
    pluginId: layer.pluginId,
    name: listing.name || layer.pluginId,
    description: listing.description || '',
    version: String(listing.version || '1'),
    requires: layer.requires,
    declarations: {
      types: layer.types,
      services: layer.services,
      editors: layer.editors,
      attachmentKinds: layer.attachmentKinds,
      conversions: layer.conversions,
      constructions: layer.constructions,
      exports: layer.exports,
      surfaces: layer.surfaces
    }
  };
}

function listingError(message) {
  const error = new Error(message);
  error.listing = true;
  return error;
}
