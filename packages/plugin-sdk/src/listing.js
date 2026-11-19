import { NODE_EXECUTION_KINDS } from './node-contract.js';
// Plugin listing contract (SPEC §Plugin marketplace): the one parser and
// validator for what a catalog listing may declare. Imported by the
// platform's install gate and publish API, and by plugin authors through
// this package — the published shape and the installable shape can never
// drift. Pure: no storage, no platform imports, runs in Node and browsers.
//
// A listing carries beside its types:
// - `services` — SPEC §8 V-grammar signatures with managed `execution`
//   metadata, remote endpoint/claim adapters, or the transitional local engine;
// - `editors` — file-type editor bindings (the same records packs declare);
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
// - `engine` — the plugin's client engine (SPEC §20 client-carried):
//   `{ module }`, a root-relative entry module the package serves; a
//   service of `mode: 'local'` executes in the browser through it;
// - `requires` — pack or plugin ids the plugin's types resolve against:
//   a requirement is satisfied by a mounted pack or an installed plugin
//   (owner decision 2026-10-17 — plugin-on-plugin requires);
// - `dependencies` — declared runtime dependencies (owner decision
//   2026-10-17): a dependency tree never crosses the platform boundary,
//   a flattened, declared bundle does. `{ name, version, module,
//   license }` per entry: the SDK's vendor command builds each
//   dependency into one flat bundle the executor serves at `module`,
//   surface modules import the bare `name`, and the module proxy
//   resolves it to the plugin's own vendor scope. What the mount
//   injects is never vendorable (`vue`, `primevue`, `pinia`, and the
//   host markdown pipeline `marked`/`dompurify`/`pele`); declared licenses
//   make the platform's license policy a gate. A `module` of the form
//   `plugin:<id><path>` (owner decision 2026-10-27) names another
//   plugin's served module: `<id>` must appear in `requires`, and the
//   module proxy resolves the import to that plugin's scope;
// - `visibility` — 'public' (the default) or 'private': a private
//   listing is served only to the organizations its `organizations` array
//   names (org ids). The catalog stays platform-published; the operator
//   scopes private listings (owner decision 2026-10-17).

const SERVICE_REF = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;
const MODULE_PATH = /^\/[a-z0-9/_-]+\.m?js$/;
const RUNTIME_ENTRY_PATH = /^\/[a-z0-9/_-]+\.(?:m?js|py|wasm)$/;
const EXECUTION_TARGETS = new Set(['browser', 'server']);
const EXECUTION_KINDS = new Set(NODE_EXECUTION_KINDS);
const RUNTIME_LANGUAGES = new Set(['javascript', 'python', 'wasm']);
const DEPENDENCY_MODULE_PATH = /^\/[a-z0-9/._-]+\.m?js$/;
// A cross-plugin dependency module (owner decision 2026-10-27): the
// required plugin's id plus a root-relative path that plugin's executor
// serves.
const CROSS_PLUGIN_DEPENDENCY_MODULE = /^plugin:([a-z0-9-]+)(\/[a-z0-9/._-]+\.m?js)$/;
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
const INJECTED_DEPENDENCIES = ['vue', 'primevue', 'pinia', 'marked', 'dompurify', 'pele'];

export function parseListing(listing = {}) {
  const declarations = listing.declarations || {};
  const types = declarations.types || [];
  const services = (declarations.services || []).filter(service => service?.id && service?.signature);
  const paletteLabels = new Map();
  const editors = declarations.editors || [];
  const constructions = declarations.constructions || {};
  const starterConstructs = (declarations.starterConstructs || []).filter(Boolean);
  const exportsList = declarations.exports || [];
  const surfaces = (declarations.surfaces || []).filter(Boolean);
  const previews = (declarations.previews || []).filter(Boolean);
  const previewChannels = (declarations.previewChannels || []).filter(Boolean);
  const dependencies = (declarations.dependencies || []).filter(Boolean);
  const runtimes = (declarations.runtimes || []).filter(Boolean);
  const engine = declarations.engine || null;
  if (engine !== null && (!engine?.module || typeof engine.module !== 'string')) {
    throw listingError(`engine needs a module path string (got ${JSON.stringify(engine?.module)})`);
  }
  if (engine !== null && !MODULE_PATH.test(engine.module)) {
    throw listingError(`engine module must be a root-relative .js/.mjs path the package serves (got ${JSON.stringify(engine.module)})`);
  }
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
    if (type.renameFrom !== undefined) {
      if (typeof type.renameFrom !== 'string' || !type.renameFrom) {
        throw listingError(`type ${type.id}: renameFrom must be the retired type id string`);
      }
      if (type.renameFrom === type.id) {
        throw listingError(`type ${type.id}: renameFrom may not name the type itself`);
      }
      if (typeById.has(type.renameFrom)) {
        throw listingError(`type ${type.id}: renameFrom names ${type.renameFrom}, which the listing also declares`);
      }
    }
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

  const runtimeById = new Map();
  for (const runtime of runtimes) {
    if (!/^[a-z0-9-]+$/.test(runtime?.id || '')) {
      throw listingError(`runtime id must be a slug (got ${JSON.stringify(runtime?.id)})`);
    }
    if (runtimeById.has(runtime.id)) {
      throw listingError(`duplicate runtime ${runtime.id}`);
    }
    if (!RUNTIME_LANGUAGES.has(runtime.language)) {
      throw listingError(`runtime ${runtime.id} language must be javascript, python, or wasm`);
    }
    if (typeof runtime.version !== 'string' || !runtime.version.trim()) {
      throw listingError(`runtime ${runtime.id} needs a version string`);
    }
    if (typeof runtime.entry !== 'string' || !RUNTIME_ENTRY_PATH.test(runtime.entry) || runtime.entry.split('/').includes('..')) {
      throw listingError(`runtime ${runtime.id} entry must be a root-relative .js/.mjs/.wasm package asset`);
    }
    const extension = runtime.entry.slice(runtime.entry.lastIndexOf('.'));
    const validExtensions = runtime.language === 'javascript' ? ['.js', '.mjs']
      : runtime.language === 'python' ? ['.py'] : ['.wasm'];
    if (!validExtensions.includes(extension)) {
      throw listingError(`runtime ${runtime.id} entry extension must match its ${runtime.language} language`);
    }
    if (!Array.isArray(runtime.targets) || !runtime.targets.length
      || runtime.targets.some(target => !EXECUTION_TARGETS.has(target))
      || new Set(runtime.targets).size !== runtime.targets.length) {
      throw listingError(`runtime ${runtime.id} targets must be a non-empty unique subset of browser and server`);
    }
    runtimeById.set(runtime.id, runtime);
  }

  for (const service of services) {
    if (!/^[a-z0-9-]+$/.test(service.id || '')) {
      throw listingError(`service id must be a slug (got ${JSON.stringify(service.id)})`);
    }
    if (!service.signature?.input || !service.signature?.output) {
      throw listingError(`service ${service.id} needs a signature with input and output`);
    }
    if (service.mode && !['endpoint', 'claim', 'local'].includes(service.mode)) {
      throw listingError(`service ${service.id} mode must be 'endpoint', 'claim', or 'local'`);
    }
    if (service.mode === 'local' && !engine) {
      throw listingError(`service ${service.id} runs in the client engine — the listing must declare one`);
    }
    if (service.execution !== undefined) {
      const execution = service.execution;
      if (service.mode !== undefined) {
        throw listingError(`service ${service.id} cannot combine execution metadata with legacy mode`);
      }
      if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
        throw listingError(`service ${service.id} execution must be an object`);
      }
      const runtime = runtimeById.get(execution.runtime);
      if (!runtime) {
        throw listingError(`service ${service.id} references undeclared runtime ${execution.runtime}`);
      }
      if (!EXECUTION_KINDS.has(execution.kind)) {
        throw listingError(`service ${service.id} execution kind must be pure, read, stateful, proposal, commit, effect, or control`);
      }
      if (!Array.isArray(execution.targets) || !execution.targets.length
        || execution.targets.some(target => !EXECUTION_TARGETS.has(target) || !runtime.targets.includes(target))
        || new Set(execution.targets).size !== execution.targets.length) {
        throw listingError(`service ${service.id} execution targets must be a non-empty subset of runtime ${runtime.id} targets`);
      }
      if (!Array.isArray(execution.capabilities || [])) {
        throw listingError(`service ${service.id} execution capabilities must be an array`);
      }
      const seenCapabilities = new Set();
      for (const capability of execution.capabilities || []) {
        if (typeof capability !== 'string' || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(capability)) {
          throw listingError(`service ${service.id} capability must be a qualified capability id`);
        }
        if (seenCapabilities.has(capability)) {
          throw listingError(`service ${service.id} declares duplicate capability ${capability}`);
        }
        seenCapabilities.add(capability);
      }
      if (['commit', 'effect'].includes(execution.kind)
        && (!execution.targets.includes('server') || execution.targets.includes('browser'))) {
        throw listingError(`service ${service.id} ${execution.kind} execution requires server support`);
      }
      if (['commit', 'effect'].includes(execution.kind) && !seenCapabilities.size) {
        throw listingError(`service ${service.id} ${execution.kind} execution requires a host capability`);
      }
      if (execution.kind === 'pure' && seenCapabilities.size) {
        throw listingError(`service ${service.id} pure execution cannot request host capabilities`);
      }
      for (const flag of ['deterministic', 'idempotent']) {
        if (execution[flag] !== undefined && typeof execution[flag] !== 'boolean') {
          throw listingError(`service ${service.id} execution ${flag} must be boolean`);
        }
      }
    }
    if (service.group !== undefined) {
      throw listingError(`service ${service.id} uses retired group metadata — use palette.group`);
    }
    if (service.configuration !== undefined) {
      const configuration = service.configuration;
      if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)
        || configuration.type !== 'object'
        || !configuration.properties || typeof configuration.properties !== 'object'
        || Array.isArray(configuration.properties)) {
        throw listingError(`service ${service.id} configuration must be an object schema with properties`);
      }
      if (configuration.required !== undefined
        && (!Array.isArray(configuration.required)
          || configuration.required.some(field => typeof field !== 'string' || !Object.hasOwn(configuration.properties, field)))) {
        throw listingError(`service ${service.id} configuration required must name declared properties`);
      }
      for (const [fieldId, field] of Object.entries(configuration.properties)) {
        if (!/^[a-z][a-z0-9-]*$/.test(fieldId)
          || !field || typeof field !== 'object' || Array.isArray(field)
          || !['string', 'number', 'integer', 'boolean', 'object', 'array'].includes(field.type)) {
          throw listingError(`service ${service.id} configuration property ${fieldId} needs a supported schema type`);
        }
        if (field.semantic?.kind !== undefined
          && !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(String(field.semantic.kind))) {
          throw listingError(`service ${service.id} configuration property ${fieldId} semantic kind must be namespaced`);
        }
      }
    }
    validatePalette(service.palette, `service ${service.id}`, paletteLabels);
    if (service.cache !== undefined) {
      if (service.cache !== 'deterministic') {
        throw listingError(`service ${service.id} cache must be 'deterministic' (got ${JSON.stringify(service.cache)})`);
      }
      if (service.mode !== 'endpoint') {
        throw listingError(`service ${service.id} cache is endpoint-only — ${service.mode || 'claim'} runs replay through their own boundary`);
      }
    }
    for (const descriptor of [service.signature?.input, service.signature?.output]) {
      for (const field of Object.values(descriptor?.base === 'record' ? descriptor.fields || {} : {})) {
        if (field?.kind !== undefined && !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(String(field.kind))) {
          throw listingError(`service ${service.id} field kind must be a namespaced slug like 'document.report' (got ${JSON.stringify(field.kind)})`);
        }
      }
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
      if (projection.group !== undefined) {
        throw listingError(`projection ${type.id}/${projection?.id} uses retired group metadata — use palette.group`);
      }
      validatePalette(projection.palette, `projection ${type.id}/${projection?.id}`, paletteLabels);
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

  // Designer preview channels (SPEC §28): one tab per channel — a
  // plugin whose palette section feeds a channel binds the channel and
  // serves its preview surface through the same read-only preview mount.
  // A channel id is globally unique across installs (the tab key).
  const seenChannelIds = new Set();
  for (const channel of previewChannels) {
    if (!/^[a-z0-9-]+$/.test(channel?.id || '')) {
      throw listingError(`preview channel id must be a slug (got ${JSON.stringify(channel.id)})`);
    }
    if (seenChannelIds.has(channel.id)) {
      throw listingError(`duplicate preview channel id ${channel.id}`);
    }
    seenChannelIds.add(channel.id);
    if (typeof channel.label !== 'string' || !channel.label.trim()) {
      throw listingError(`preview channel ${channel.id} needs a label string`);
    }
    if (surfaceKindOf.get(channel.surface) !== 'preview') {
      throw listingError(`preview channel ${channel.id} references surface ${channel.surface}, which is not a preview surface`);
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
    const crossPlugin = String(dependency?.module || '').match(CROSS_PLUGIN_DEPENDENCY_MODULE);
    if (!crossPlugin && !DEPENDENCY_MODULE_PATH.test(dependency?.module || '')) {
      throw listingError(`dependency ${dependency.name} module must be a root-relative .js/.mjs path the executor serves (got ${JSON.stringify(dependency?.module)})`);
    }
    if (crossPlugin && !requires.includes(crossPlugin[1])) {
      throw listingError(`dependency ${dependency.name} names plugin ${crossPlugin[1]}, which the listing does not require`);
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

  return { pluginId, types, services, editors, constructions, starterConstructs, exports: exportsList, surfaces, previews, previewChannels, dependencies, runtimes, engine, requires, visibility, organizations };
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
      constructions: layer.constructions,
      starterConstructs: layer.starterConstructs,
      exports: layer.exports,
      surfaces: layer.surfaces,
      previews: layer.previews,
      previewChannels: layer.previewChannels,
      dependencies: layer.dependencies,
      runtimes: layer.runtimes,
      ...(layer.engine ? { engine: layer.engine } : {})
    }
  };
}

function listingError(message) {
  const error = new Error(message);
  error.listing = true;
  return error;
}


function validatePalette(palette, context, groupLabels = new Map()) {
  if (palette === undefined) return;
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) {
    throw listingError(`${context} palette must be an object`);
  }
  const allowed = new Set(['group', 'label', 'keywords', 'visible']);
  const unknown = Object.keys(palette).filter(key => !allowed.has(key));
  if (unknown.length) throw listingError(`${context} palette has unsupported fields: ${unknown.join(', ')}`);
  if (palette.group !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(String(palette.group))) {
    throw listingError(`${context} palette.group must be a stable lowercase slug`);
  }
  if (palette.label !== undefined && (typeof palette.label !== 'string' || !palette.label.trim())) {
    throw listingError(`${context} palette.label must be a non-empty string`);
  }
  if (palette.label !== undefined && palette.group === undefined) {
    throw listingError(`${context} palette.label requires palette.group`);
  }
  if (palette.group && palette.label) {
    const previousLabel = groupLabels.get(palette.group);
    if (previousLabel && previousLabel !== palette.label.trim()) {
      throw listingError(`${context} palette label for group ${palette.group} must match ${JSON.stringify(previousLabel)}`);
    }
    groupLabels.set(palette.group, palette.label.trim());
  }
  if (palette.keywords !== undefined && (!Array.isArray(palette.keywords)
    || palette.keywords.some(keyword => typeof keyword !== 'string' || !keyword.trim())
    || new Set(palette.keywords).size !== palette.keywords.length)) {
    throw listingError(`${context} palette.keywords must be non-empty strings`);
  }
  if (palette.visible !== undefined && typeof palette.visible !== 'boolean') {
    throw listingError(`${context} palette.visible must be boolean`);
  }
}
