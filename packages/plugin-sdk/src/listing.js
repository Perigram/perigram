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
// - `surfaces` — plugin-delivered surface modules (owner decision
//   2026-10-11): `[{ id, module, surfaceContract, kind? }]` where
//   `module` is a root-relative path the plugin's executor serves,
//   `surfaceContract` is the mount-contract major the module targets,
//   and `kind` is `editor` (the default) or `preview` (M7: a read-only
//   `{ record, payload }` mount into the platform's preview slots —
//   always contract 1);
// - `previews` — preview bindings `[{ type, surface }]`: the plugin's
//   types whose preview slots mount the bound preview surface (one per
//   type, the surface must be kind `preview`);
// - `requires` — pack or plugin ids the plugin's types resolve against:
//   a requirement is satisfied by a mounted pack or an installed plugin
//   (owner decision 2026-10-17 — plugin-on-plugin requires);
// - `dependencies` — declared runtime dependencies (owner decision
//   2026-10-17): a dependency tree never crosses the platform boundary,
//   a flattened, declared artifact does. `{ name, version, module,
//   license }` per entry: the SDK's vendor command builds each
//   dependency into one flat bundle the executor serves at `module`,
//   surface modules import the bare `name`, and the module proxy
//   resolves it to the plugin's own vendor scope. What the mount
//   injects is never vendorable (`vue`, `primevue`, `pinia`, and the
//   host markdown pipeline `marked`/`dompurify`); declared licenses
//   make the platform's license policy a gate;
// - `visibility` — 'public' (the default) or 'private': a private
//   listing is served only to the organizations its `organizations` array
//   names (org ids). The catalog stays platform-published; the operator
//   scopes private listings (owner decision 2026-10-17).

const SERVICE_REF = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;
const MODULE_PATH = /^\/[a-z0-9/_-]+\.m?js$/;
const DEPENDENCY_MODULE_PATH = /^\/[a-z0-9/._-]+\.m?js$/;
// An npm specifier: package name (scoped or plain), optionally with
// subpaths — milkdown's '@milkdown/prose/commands' family needs them,
// and the vendor build's shared chunks keep one class identity across
// the subpath bundles.
const DEPENDENCY_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(\/[a-z0-9-._~]+)*$/;
const SPDX_LIKE = /^[A-Za-z0-9.+-]+$/;

// What the surface mount injects — a dependency naming one of these is a
// bundled copy of a host external (the consistency law's refusal) or of
// the host's single markdown pipeline. The mount provides them; the
// listing may never vendor them.
export const INJECTED_DEPENDENCIES = ['vue', 'primevue', 'pinia', 'marked', 'dompurify'];

export function parseListing(listing = {}) {
  const declarations = listing.declarations || {};
  const types = declarations.types || [];
  const services = (declarations.services || []).filter(service => service?.id && service?.signature);
  const editors = declarations.editors || [];
  const attachmentKinds = declarations.attachmentKinds || {};
  const conversions = declarations.conversions || [];
  const constructions = declarations.constructions || {};
  const starterConstructs = (declarations.starterConstructs || []).filter(Boolean);
  const exportsList = declarations.exports || [];
  const surfaces = (declarations.surfaces || []).filter(Boolean);
  const previews = (declarations.previews || []).filter(Boolean);
  const dependencies = (declarations.dependencies || []).filter(Boolean);
  const requires = Array.isArray(listing.requires) ? listing.requires.map(String) : [];
  const pluginId = String(listing.pluginId || '');
  const visibility = listing.visibility === 'private' ? 'private' : 'public';
  if (listing.visibility !== undefined && !['public', 'private'].includes(listing.visibility)) {
    throw listingError(`visibility must be 'public' or 'private' (got ${JSON.stringify(listing.visibility)})`);
  }
  const organizations = Array.isArray(listing.organizations)
    ? listing.organizations.map(id => String(id))
    : [];

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
  const typeById = new Map(types.map(type => [type.id, type]));
  for (const type of types) {
    if (type.access?.inherits !== undefined) {
      const parent = typeById.get(type.access.inherits);
      if (!type.access.inherits || typeof type.access.inherits !== 'string' || !parent) {
        throw listingError(`type ${type.id}: access.inherits must name a type this plugin declares`);
      }
      if (parent.id === type.id) {
        throw listingError(`type ${type.id}: access.inherits may not name the type itself`);
      }
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

  // Starter constructs (SPEC §UI visible-by-default): what the plugin
  // stations into every installing organization's initial process — the
  // pack law: the plugin's own file type, a mode it declares, one
  // construct per type.
  const seenStarterTypes = new Set();
  for (const construct of starterConstructs) {
    if (!construct?.typeId || !construct?.construction) {
      throw listingError(`malformed starter construct: ${JSON.stringify(construct)}`);
    }
    const declaration = typeById.get(construct.typeId);
    if (!declaration) {
      throw listingError(`starter construct for type ${construct.typeId} must reference a type this plugin declares`);
    }
    if (declaration.class !== 'file') {
      throw listingError(`starter construct for type ${construct.typeId} of class ${declaration.class} requires a file type`);
    }
    if (seenStarterTypes.has(construct.typeId)) {
      throw listingError(`duplicate starter construct for type ${construct.typeId}`);
    }
    if (!constructModesOf(declaration).has(construct.construction)) {
      throw listingError(`starter construct for ${construct.typeId} names construction mode ${construct.construction}, which the type does not declare`);
    }
    seenStarterTypes.add(construct.typeId);
  }

  // Type projections (SPEC §8 p extract): a listing's projections resolve
  // a stored `field` path or a declared plugin service. A service resolve
  // must be endpoint mode — a projection is a synchronous read and cannot
  // park on the claim queue. A `handler` resolve is the pack-mount
  // binding and refuses here: no platform handler would ever serve a
  // plugin's id.
  for (const type of types) {
    for (const projection of type?.projections || []) {
      const resolve = projection?.resolve || {};
      if (resolve.handler !== undefined) {
        throw listingError(`projection ${type.id}/${projection?.id} resolves through a handler — plugin projections resolve a field or a service`);
      }
      if (resolve.service !== undefined) {
        const ref = serviceRefOf(resolve.service, `projection ${type.id}/${projection?.id}`);
        const service = services.find(item => item.id === ref.split('.').pop());
        if (service?.mode !== 'endpoint') {
          throw listingError(`projection ${type.id}/${projection?.id} binds service ${ref}, which is not endpoint mode — a projection is a synchronous read`);
        }
      } else if (resolve.field === undefined) {
        throw listingError(`projection ${type.id}/${projection?.id} needs a field or service resolve (got ${JSON.stringify(resolve)})`);
      }
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
  const surfaceKindOf = new Map();
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
    const kind = surface.kind || 'editor';
    if (!['editor', 'preview'].includes(kind)) {
      throw listingError(`surface ${surface.id} kind must be 'editor' or 'preview' (got ${JSON.stringify(surface.kind)})`);
    }
    if (kind === 'preview' && surface.surfaceContract !== 1) {
      throw listingError(`preview surface ${surface.id} must target contract 1 — the read-only mount (got ${surface.surfaceContract})`);
    }
    surfaceKindOf.set(surface.id, kind);
  }

  // Bindings and kinds must agree: an editor binding mounts the editor
  // chrome (persistence callbacks), a preview binding mounts read-only —
  // a surface cannot serve both roles.
  for (const editor of editors) {
    if (surfaceKindOf.get(editor.surface) !== 'editor') {
      throw listingError(`editor binding for type ${editor.type} references surface ${editor.surface}, which is not an editor surface`);
    }
  }
  const seenPreviewTypes = new Set();
  for (const preview of previews) {
    if (!preview?.type || !preview?.surface) {
      throw listingError(`malformed preview binding: ${JSON.stringify(preview)}`);
    }
    if (!typeById.has(preview.type)) {
      throw listingError(`preview binding for type ${preview.type} must reference a type this plugin declares`);
    }
    if (seenPreviewTypes.has(preview.type)) {
      throw listingError(`duplicate preview binding for type ${preview.type} — exactly one preview per type`);
    }
    seenPreviewTypes.add(preview.type);
    if (surfaceKindOf.get(preview.surface) !== 'preview') {
      throw listingError(`preview binding for type ${preview.type} references surface ${preview.surface}, which is not a preview surface`);
    }
  }

  // Declared runtime dependencies (owner decision 2026-10-17): one flat,
  // license-declared vendor bundle per name, served by this executor.
  const seenDependencyNames = new Set();
  const seenDependencyModules = new Set();
  for (const dependency of dependencies) {
    if (!DEPENDENCY_NAME.test(dependency?.name || '')) {
      throw listingError(`dependency name must be an npm package name (got ${JSON.stringify(dependency?.name)})`);
    }
    if (!dependency?.version || typeof dependency.version !== 'string') {
      throw listingError(`dependency ${dependency.name} needs a version string`);
    }
    if (!SPDX_LIKE.test(dependency?.license || '')) {
      throw listingError(`dependency ${dependency.name} needs a license identifier (got ${JSON.stringify(dependency?.license)})`);
    }
    if (!DEPENDENCY_MODULE_PATH.test(dependency?.module || '')) {
      throw listingError(`dependency ${dependency.name} module must be a root-relative .js/.mjs path the executor serves (got ${JSON.stringify(dependency?.module)})`);
    }
    if (dependency.module.split('/').includes('..')) {
      throw listingError(`dependency ${dependency.name} module must not traverse (${dependency.module})`);
    }
    if (INJECTED_DEPENDENCIES.includes(dependency.name)) {
      throw listingError(`dependency ${dependency.name} is a host-injected external — the mount provides it, a plugin never vendors it`);
    }
    if (seenDependencyNames.has(dependency.name)) {
      throw listingError(`duplicate dependency ${dependency.name}`);
    }
    if (seenDependencyModules.has(dependency.module)) {
      throw listingError(`dependencies ${dependency.name} and another share the module ${dependency.module}`);
    }
    seenDependencyNames.add(dependency.name);
    seenDependencyModules.add(dependency.module);
  }

  for (const packId of requires) {
    if (!/^[a-z0-9-]+$/.test(packId)) {
      throw listingError(`requires entries must be pack or plugin slugs (got ${JSON.stringify(packId)})`);
    }
    if (packId === pluginId) {
      throw listingError('a plugin cannot require itself');
    }
  }

  return { pluginId, types, services, editors, attachmentKinds, conversions, constructions, starterConstructs, exports: exportsList, surfaces, previews, dependencies, requires, visibility, organizations };
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
    visibility: layer.visibility,
    ...(layer.visibility === 'private' && layer.organizations.length
      ? { organizations: layer.organizations }
      : {}),
    declarations: {
      types: layer.types,
      services: layer.services,
      editors: layer.editors,
      attachmentKinds: layer.attachmentKinds,
      conversions: layer.conversions,
      constructions: layer.constructions,
      starterConstructs: layer.starterConstructs,
      exports: layer.exports,
      surfaces: layer.surfaces,
      previews: layer.previews,
      dependencies: layer.dependencies
    }
  };
}

function listingError(message) {
  const error = new Error(message);
  error.listing = true;
  return error;
}
