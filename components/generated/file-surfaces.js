import RemoteEditorSurface from '~/components/generated/RemoteEditorSurface.vue';
import EditorPageSurface from '~/components/generated/EditorPageSurface.vue';
import { defineAsyncComponent, unref } from 'vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { isGeneratedSurfaceAction, isCreateAction } from '~/utils/action-visibility.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { hasPermissionGrant } from '#shared/access-control.js';
import { resolveTypeFeature } from '#shared/field-access-policies.js';
import { instancePayloadFileUrl } from './file-preview-contract.js';

/**
 * File surfaces: the single app-side home of the CTS file-type editor
 * contract (SPEC §4 — a file opens as its full-page editor under the
 * unified page header). Pack editor bindings decide which file type
 * opens which surface; this registry maps surface ids to the app's
 * editor presentations. Process data never selects components — the
 * surface id does.
 *
 * An editor surface renders in two mounts, both from the one
 * `workspacePage` presentation (`labelKey`, `icon`, `component`,
 * `props` — the props adapter receives the page record and the bound
 * type id): the editor page — the record document's editor mount
 * flushed under the unified header on open page surfaces (the detail
 * pane/tab of an editor-bound type), and the workspace pane tab
 * (`EditorPageSurface`) a record without a compiled detail screen opens
 * as. A bound editor page also opens **blank** —
 * `openBlankFileEditor`.
 */
export const fileSurfaceRegistry = {
  // The one editor (SPEC §28.14): the graph-document surface opens the
  // unified editor page itself — a `direct` presentation mounts the page
  // component flush with its own shell (the graphs list owns file and
  // lifecycle commands), both as the workspace pane tab and as the
  // record's editor body.
  'graph-editor': {
    workspacePage: {
      labelKey: 'processDesigner.graphDocument',
      icon: 'pi pi-share-alt',
      component: defineAsyncComponent(() => import('~/pages/organization/process.vue')),
      direct: true,
      // The editor renders its document chrome itself (the workspace file
      // panel): hosts pass no page-chrome channel to this surface.
      ownsChrome: true,
      props: page => ({ graphInstanceId: String(page?.entity?._id || page?.entity?.id || 'blank') })
    }
  }
};

/**
 * The one write-grant check every editor mount and payload-version
 * affordance takes: the same feature the server's instance transports
 * gate (`resolveTypeFeature`: field-policy feature, else the class
 * collection) at write level. The server stays fail-closed behind it.
 */
export function editorWriteGranted(typeId = '', entity = null) {
  const authStore = useAuthStore();
  const registry = useRegistryStore();
  return hasPermissionGrant({
    permissions: authStore.activePermissions || {},
    feature: resolveTypeFeature(typeId, registry.typeRecord(typeId)),
    level: 'write',
    entity,
    typeId
  });
}

/**
 * The editor mount mode (SPEC §4): the opener's grant decides — a write
 * grant edits in place, a read grant renders the same surface read-only.
 */
export function editorMountMode(typeId = '', entity = null) {
  return editorWriteGranted(typeId, entity) ? 'edit' : 'read';
}

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
        // The blank editor's first save creates the instance and its first
        // payload through the one generic editor-create boundary. The type
        // declaration owns mime/size validation; graph documents validate
        // their canonical graph server-side.
        const name = String(record.name || '').trim()
          || String(filename || '').replace(/\.[^.]+$/, '')
          || typeId;
        const created = await $fetch(`/api/instances/${encodeURIComponent(typeId)}/editor`, {
          method: 'POST',
          body: { name, payload: text }
        });
        instanceId = String(created._id || created.id || '');
        if (!instanceId) throw new Error(`${typeId} creation returned no instance`);
        record.name = created.name || name;
        record.payload = created.payload || null;
        notify(created, 'payload-create');
        return created;
      }
      const form = new FormData();
      form.append('file', new File([text], filename, { type: mimeType }));
      const updated = await $fetch(`/api/instances/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}/payload`, { method: 'PUT', body: form });
      if (updated?.payload) record.payload = updated.payload;
      let result = updated;
      if (typeId === 'graph-document') {
        let graph;
        try { graph = JSON.parse(text); } catch { throw new Error('Graph document payload must be valid JSON'); }
        if (!graph?.id) throw new Error('Graph document payload must carry its canonical graph identity');
        const instances = useInstancesStore();
        const identityUpdate = await instances.updateInstance(
          instances.canonicalTypeKey(typeId), instanceId,
          { fields: { graphId: String(graph.id) } },
          { typeId, reason: 'graph-identity' }
        );
        result = { ...updated, ...identityUpdate, payload: updated?.payload || identityUpdate?.payload };
      }
      // Editor saves owe the shared emission contract (stores README):
      // the browser-local event reconciles every other open pane, the
      // typed invalidation reaches other sessions through the realtime
      // bridge.
      notify(result, 'payload-save');
      return result;
    },
    recordExecution: async (executionRecord) => {
      if (!instanceId) throw new Error('Save the graph document before recording an execution');
      return await $fetch('/api/graph-executions', {
        method: 'POST',
        headers: { 'Idempotency-Key': `graph-execution:${executionRecord.id}` },
        body: { graphDocumentInstanceId: instanceId, record: executionRecord }
      });
    },
    bakeFile: async ({ graphDocumentInstanceId, record: previewRecord, outputId, destination } = {}) => {
      if (!instanceId || String(graphDocumentInstanceId) !== instanceId) throw new Error('Bake source does not match the open graph document');
      if (!destination?.pageId || !destination?.path || !outputId) throw new Error('Bake requires an exact page, relative file path, and selected output');
      if (!Object.prototype.hasOwnProperty.call(previewRecord?.outputs || {}, outputId)) {
        throw new Error(`Graph output ${outputId} is unavailable`);
      }
      return await $fetch('/api/graph-executions/bake', {
        method: 'POST',
        headers: { 'Idempotency-Key': `graph-bake:${previewRecord.id}:${destination.pageId}:${destination.path}:${outputId}` },
        body: {
          graphDocumentInstanceId: instanceId,
          record: previewRecord,
          outputId,
          destination
        }
      });
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

// The app's own editor bindings — types whose editor surface lives in
// the local registry, beside the served plugin bindings. Merged under
// the served list in `activeEditorBindings` so a fetched organization
// type view (which carries only plugin bindings) never shadows them.
export const frameworkEditorBindings = validateEditorBindings([
  { type: 'graph-document', surface: 'graph-editor', modes: ['edit'] }
]);

// Served-list default (editor-binding guard): when the app has fetched
// the organization type view, the served editor list is the authoritative
// binding source, read through the `useFileTypeView` cache. The pack
// import above stays as the explicit fallback for contexts without a
// fetched view — module-scope evaluation, unit specs, and pre-auth
// shells. A loaded-but-empty served list also falls back: today every
// served editor comes from the mounted packs or installed plugins, so
// empty can only mean "nothing fetched for this context". The app's own
// bindings ride beside either list (a served binding for the same type
// wins — the plugin layer owns it). The served
// surface declarations follow the same law: plugin-delivered surface
// modules resolve beside the local registry (owner decision 2026-10-11).
function activeEditorBindings() {
  let served = packEditorBindings;
  try {
    const view = useFileTypeView();
    const editors = unref(view.editors);
    if (unref(view.loaded) && Array.isArray(editors) && editors.length) served = editors;
  } catch {
    // No active Pinia/app context (module scope, unit specs).
  }
  const servedTypes = new Set(served.map(binding => binding?.type));
  return [...served, ...frameworkEditorBindings.filter(binding => !servedTypes.has(binding.type))];
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
 * documented fallbacks. The record carries `workspacePage` alone: the
 * workspace tab and the record body mount the same presentation.
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
    remote: true,
    workspacePage: {
      icon: 'pi pi-file-edit',
      component: RemoteEditorSurface,
      props: page => ({ record: page.entity, typeId, surface: declared, mode: editorMountMode(typeId, page.entity) })
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
  // the create — mobile falls back to the direct construct; the routed
  // detail surface's body is the editor.
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
 * Editor pages own their shell (flush) and their record header — the
 * page host skips its own lineage strip for them.
 */
export function fileWorkspacePages(editors = activeEditorBindings(), surfaces = activeSurfaceDeclarations()) {
  return (editors || [])
    .map(editor => {
      const surface = resolveFileSurface(editors, editor.type, surfaces);
      if (!surface?.workspacePage) return null;
      // A direct presentation mounts the page component itself: the
      // surface owns its whole shell and identity (SPEC §28.14 one
      // editor — the graph-document surface is the unified editor page).
      if (surface.workspacePage.direct) {
        return {
          id: editor.surface,
          typeId: editor.type,
          labelKey: surface.workspacePage.labelKey,
          icon: surface.workspacePage.icon,
          component: surface.workspacePage.component,
          flush: true,
          props: page => surface.workspacePage.props?.(page, editor.type) || {}
        };
      }
      return {
        id: editor.surface,
        typeId: editor.type,
        labelKey: surface.workspacePage.labelKey,
        icon: surface.workspacePage.icon,
        component: EditorPageSurface,
        flush: true,
        recordHeader: true,
        props: page => ({ editor: surface.workspacePage, entity: page.entity, typeId: editor.type })
      };
    })
    .filter(Boolean);
}

// The pure payload-preview decision helpers live in the component-free
// `file-preview.js` leaf (same contract home); re-exported here for the
// editor-surface consumers that already import from this module.
export { instancePayloadFileUrl, resolveFilePreview } from './file-preview-contract.js';
