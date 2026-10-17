import RemoteEditorSurface from '~/components/generated/RemoteEditorSurface.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { unref } from 'vue';
import { isGeneratedSurfaceAction, isCreateAction } from '~/utils/action-visibility.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { instancePayloadFileUrl } from './file-preview-contract.js';

/**
 * File surfaces: the single app-side home of the CTS file-type editor
 * contract (SPEC §21). Pack editor bindings decide which file type opens
 * which surface and in which modes; this registry maps surface ids to the
 * app's editor presentations. Process data never selects components — the
 * surface id does.
 *
 * Every editor surface is a WORKSPACE PAGE: editors never embed inside
 * generated instance detail chrome. A surface record carries:
 * - `workspacePage`: the pane workspace-page presentation
 *   (`labelKey`, `icon`, `component`, `props` — the props adapter receives
 *   the page record and the bound type id);
 * - `action`: the editor-action component that opens the page — the
 *   cassette designer keeps its own for its dialog persistence flows;
 *   every other surface declares `'generic'`, resolved to
 *   `GeneratedEditorPageAction` by `instance-editor-action.js` (the
 *   component imports this module, so a static import here would cycle).
 *   The action renders like its neighbor generated action buttons and
 *   opens the page through the pane chain in-workspace or the
 *   workspace-page-open seam elsewhere; mobile keeps a dialog.
 *   `flush` marks surfaces that own their shell (the text/csv editor's
 *   document surface): the pane host renders them without its padded
 *   scroll area, and the flag rides `resolveFileSurface` into the derived
 *   workspace-page rows.
 */
export const fileSurfaceRegistry = {};

/**
 * The blank construct an editor's first save rides (SPEC §UI): runs the
 * type's compiled create action with empty data — blank means blank, the
 * instance enters unnamed — and returns the created entity. The single
 * home of the channel; the plugin persistence's createBlank and the
 * instance persistence's deferred save delegate here.
 */
export async function runBlankFileConstruct(typeId = '') {
  const authStore = useAuthStore();
  const instances = useInstancesStore();
  const action = (authStore.actionManifest || [])
    .filter(isGeneratedSurfaceAction)
    .find(candidate => isCreateAction(candidate) && candidate.typeId === typeId);
  if (!action) throw new Error(`No compiled create action for ${typeId}`);
  const result = await instances.runAction({ action, actionId: action.id, data: {} });
  const entity = createdEntity(action, result);
  const id = String(entity?._id || entity?.id || '');
  if (!id) throw new Error(`${typeId} creation returned no instance`);
  return entity;
}

/**
 * Generic instance-backed persistence: loads text from the payload
 * download URL, saves through the revisioned instance payload transport
 * (which records an immutable content revision per save). An unbound
 * record (the blank editor page) defers to the first save — the save
 * runs the blank construct and binds the created id for every later
 * call. Editors' surface adapters project this onto their own contract
 * shapes.
 */
export function instancePayloadPersistence(entity = {}, typeId = '', mimeType = 'application/octet-stream') {
  // The blank editor page passes `entity: null` — nothing exists until
  // the first save — and default parameters only catch `undefined`, so
  // the record is coerced here; every surface adapter rides this base.
  const record = entity || {};
  let instanceId = String(record._id || record.id || '');
  // Surfaces identify their own publications through this token: the
  // local event carries it so the acting editor skips its own change
  // (the cross-session invalidation never does).
  const origin = `persistence:${typeId}:${instanceId || 'blank'}`;
  const notify = (snapshot, reason) => {
    useInstancesStore().notifyMutated(typeId, instanceId, { snapshot, reason, origin });
  };
  // Payload resolves store-first: every save writes a NEW payload file
  // (revisions are immutable), so the mount-time reference goes stale —
  // a reload that reads it serves the previous revision forever. The
  // store record carries the fresh payload (the save event's snapshot
  // lands there synchronously before any reload runs).
  const currentPayload = () => {
    try {
      const instances = useInstancesStore();
      return instances.dtoFor(instances.canonicalTypeKey(typeId), instanceId)?.payload || record.payload;
    } catch {
      // No active Pinia/app context (module scope, unit specs).
      return record.payload;
    }
  };
  return {
    typeId,
    instanceId,
    origin,
    title: record.name || '',
    load: async () => {
      if (!instanceId) return '';
      const payloadUrl = instancePayloadFileUrl(currentPayload());
      if (!payloadUrl) return '';
      const response = await fetch(payloadUrl);
      if (!response.ok) return '';
      return await response.text();
    },
    save: async (text, filename) => {
      if (!instanceId) {
        const created = await runBlankFileConstruct(typeId);
        instanceId = String(created._id || created.id || '');
        if (!instanceId) throw new Error(`${typeId} creation returned no instance`);
        notify(created, 'payload-create');
      }
      const form = new FormData();
      form.append('file', new File([text], filename, { type: mimeType }));
      const updated = await $fetch(`/api/instances/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}/payload`, { method: 'PUT', body: form });
      if (updated?.payload) record.payload = updated.payload;
      // Editor saves owe the shared emission contract (stores README):
      // the browser-local event reconciles every other open pane, the
      // typed invalidation reaches other sessions through the realtime
      // bridge.
      notify(updated, 'payload-save');
      return updated;
    },
    rename: async (name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed || !instanceId) return null;
      const instances = useInstancesStore();
      return await instances.updateInstance(instances.canonicalTypeKey(typeId), instanceId, { name: trimmed }, { typeId, reason: 'editor-rename' });
    }
  };
}


/**
 * Validate editor bindings against the surface registry (the app-side
 * editor-binding guards):
 * - every binding's surface id must exist in the registry (the error
 *   names the binding's type and the unknown surface id);
 * - a type may carry at most one binding (the error names both surfaces).
 * Pure by design; `file-surfaces.spec.js` runs it red-green against the
 * real pack bindings.
 */
export function validateEditorBindings(bindings = [], registry = fileSurfaceRegistry) {
  const byType = new Map();
  for (const binding of bindings || []) {
    const surfaceId = binding?.surface;
    if (!surfaceId || !registry[surfaceId]) {
      throw new Error(`editor binding for type ${binding?.type ?? '(no type)'} references unknown surface ${surfaceId ?? '(no surface)'} — register the surface in file-surfaces.js or fix the binding`);
    }
    const existing = byType.get(binding.type);
    if (existing) {
      throw new Error(`duplicate editor binding for type ${binding.type}: surfaces ${existing.surface} and ${surfaceId} — exactly one editor surface per file type`);
    }
    byType.set(binding.type, binding);
  }
  return bindings;
}

// The mounted packs' editor bindings in composition order — the same
// records the cts-types feature serves with the organization type view.
// Validated at module load so pack/registry drift fails here, not as a
// silently missing editor presentation. The facade and tech-drawing
// domains' editor bindings (cassette designer, sheet editor, sketch
// editor) arrive with the organization type view from the installed
// plugins and resolve as plugin-delivered surface modules
// (RemoteEditorSurface) — the pre-auth fallback below covers only
// always-mounted pack types.
export const packEditorBindings = validateEditorBindings([]);

// Served-list default (editor-binding guard): when the app has fetched
// the organization type view, the served editor list is the authoritative
// binding source, read through the `useFileTypeView` cache. The pack
// import above stays as the explicit fallback for contexts without a
// fetched view — module-scope evaluation, unit specs, and pre-auth
// shells. A loaded-but-empty served list also falls back: today every
// served editor comes from the mounted packs or installed plugins, so
// empty can only mean "nothing fetched for this context". The served
// surface declarations follow the same law: plugin-delivered surface
// modules resolve beside the local registry (owner decision 2026-10-11).
function activeEditorBindings() {
  try {
    const view = useFileTypeView();
    const editors = unref(view.editors);
    if (unref(view.loaded) && Array.isArray(editors) && editors.length) return editors;
  } catch {
    // No active Pinia/app context (module scope, unit specs).
  }
  return packEditorBindings;
}

function activeSurfaceDeclarations() {
  try {
    const view = useFileTypeView();
    const surfaces = unref(view.surfaces);
    if (unref(view.loaded) && Array.isArray(surfaces)) return surfaces;
  } catch {
    // No active Pinia/app context (module scope, unit specs).
  }
  return [];
}

/**
 * Resolve one file type's surface record from editor bindings. Returns
 * `null` when the type has no editor binding or the bound surface has no
 * presentation. A binding resolves against the fixed local registry
 * first; a surface id the registry does not carry resolves against the
 * served plugin surface declarations — the loader shell mounts the
 * plugin's module (see RemoteEditorSurface). Omitting `editors` resolves
 * both lists against the organization type view when fetched, with the
 * documented fallbacks.
 */
export function resolveFileSurface(editors, typeId = '', surfaces = null) {
  const bindings = editors == null ? activeEditorBindings() : editors;
  const declarations = surfaces == null && editors == null ? activeSurfaceDeclarations() : (surfaces || []);
  const editor = (bindings || []).find(item => item?.type === typeId && (fileSurfaceRegistry[item.surface] || declarations.some(surface => surface.id === item.surface)));
  if (!editor) return null;
  const local = fileSurfaceRegistry[editor.surface];
  if (local) {
    return {
      typeId,
      surface: editor.surface,
      modes: [...(editor.modes || [])],
      action: local.action || null,
      ...(local.flush ? { flush: true } : {}),
      workspacePage: local.workspacePage || null
    };
  }
  const declared = declarations.find(surface => surface.id === editor.surface);
  if (!declared) return null;
  return {
    typeId,
    surface: editor.surface,
    modes: [...(editor.modes || [])],
    action: 'generic',
    remote: true,
    workspacePage: {
      icon: 'pi pi-file-edit',
      component: RemoteEditorSurface,
      props: page => ({ record: page.entity, typeId, surface: declared })
    }
  };
}

/**
 * Opens the type's bound editor page blank (SPEC §UI): the create button
 * of an editor-protocol type opens the editor with no record — the first
 * save creates the instance and fills its payload in one act. Returns
 * false when no editor page resolves (the caller falls back to running
 * the construct directly).
 */
export function openBlankFileEditor(typeId = '') {
  // Desktop only: mobile has no panes, and a silent no-op would swallow
  // the create — mobile falls back to the direct construct and the
  // routed detail surface (the editor opens through its header action).
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)')?.matches) return false;
  const surface = resolveFileSurface(undefined, typeId);
  if (!surface?.workspacePage) return false;
  return openWorkspacePageFromChrome({ pageId: surface.surface, typeId, entity: null });
}

/**
 * Derive registered workspace-page rows for every bound file type whose
 * surface has a pane presentation. Page ids are the surface ids, so
 * persisted pane state stays stable; the props adapter receives the page
 * record and the bound type id (one surface may serve several types).
 */
export function fileWorkspacePages(editors = activeEditorBindings(), surfaces = activeSurfaceDeclarations()) {
  return (editors || [])
    .map(editor => {
      const surface = resolveFileSurface(editors, editor.type, surfaces);
      return surface?.workspacePage
        ? {
            id: editor.surface,
            typeId: editor.type,
            labelKey: surface.workspacePage.labelKey,
            icon: surface.workspacePage.icon,
            component: surface.workspacePage.component,
            ...(surface.flush ? { flush: true } : {}),
            props: page => surface.workspacePage.props(page, editor.type)
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Derive editor-action rows: every bound file type resolves the action
 * that opens its editor page — a registered component or `'generic'`.
 */
export function fileEditorActions(editors = activeEditorBindings(), surfaces = activeSurfaceDeclarations()) {
  return (editors || [])
    .map((editor) => {
      const surface = resolveFileSurface(editors, editor.type, surfaces);
      return surface?.action
        ? [editor.type, { action: surface.action }]
        : null;
    })
    .filter(Boolean);
}

// The pure payload-preview decision helpers live in the component-free
// `file-preview.js` leaf (same contract home); re-exported here for the
// editor-surface consumers that already import from this module.
export { instancePayloadFileUrl, resolveFilePreview } from './file-preview-contract.js';
