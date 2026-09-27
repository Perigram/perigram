import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import TableImportSurface from '~/components/generated/TableImportSurface.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import SketchEditor from '~/components/artifacts/SketchEditor.vue';
import ArtifactTextEditor from '~/components/artifacts/ArtifactTextEditor.vue';
import { facadeEditors } from '@perigram/facade';
import { techDrawingEditors } from '~/packages/tech-drawing/src/index.js';
import { documentsEditors } from '~/packages/documents/src/index.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { unref } from 'vue';
import { instancePayloadFileUrl } from './file-preview-contract.js';

/**
 * File surfaces: the single app-side home of the CTS file-type editor
 * contract (SPEC §21). Pack editor bindings decide which file type opens
 * which surface and in which modes; this registry maps surface ids to the
 * app's editor presentations. Process data never selects components — the
 * surface id does.
 *
 * A surface record may carry:
 * - `detail`: the generated detail-body overload presentation
 *   (`component`, `props` adapter, `ownsActionSurface`);
 * - `action`: the card/detail editor-action button component;
 * - `workspacePage`: the pane workspace-page presentation
 *   (`labelKey`, `icon`, `component`, `props`);
 * - `forcesIdentity`: the editor owns its surface so the generated detail
 *   keeps the identity block even without an action component.
 */
export const fileSurfaceRegistry = {
  'cassette-designer': {
    detail: {
      component: GeneratedCassetteDesignerWorkspacePage,
      ownsActionSurface: true,
      props: ({ entity }) => ({ cassette: entity })
    },
    action: GeneratedCassetteDesignerAction,
    workspacePage: {
      labelKey: 'cassette.designerTitle',
      icon: 'pi pi-pencil',
      component: GeneratedCassetteDesignerWorkspacePage,
      props: page => ({ cassette: page.entity, cassettes: page.cassettes || [] })
    }
  },
  'sheet-design-editor': {
    detail: {
      component: SheetDesignEditor,
      ownsActionSurface: true,
      props: ({ entity, canEditSheetDesign }) => ({ design: entity, editable: canEditSheetDesign })
    },
    forcesIdentity: true
  },
  'sketch-editor': {
    detail: {
      component: SketchEditor,
      ownsActionSurface: true,
      props: ({ entity, typeId }) => ({ persistence: sketchInstancePersistence(entity, typeId) })
    },
    forcesIdentity: true
  },
  'text-editor': {
    detail: {
      component: ArtifactTextEditor,
      ownsActionSurface: true,
      props: ({ entity, typeId }) => ({
        persistence: textInstancePersistence(entity, typeId, 'text'),
        format: 'text'
      })
    },
    forcesIdentity: true
  },
  'csv-editor': {
    detail: {
      component: ArtifactTextEditor,
      ownsActionSurface: true,
      props: ({ entity, typeId }) => ({
        persistence: textInstancePersistence(entity, typeId, 'csv'),
        format: 'csv'
      })
    },
    forcesIdentity: true
  },
  // The workbook's editor is the import mapper: parse the payload
  // client-side, map columns onto a target type's declared vocabulary,
  // construct through the instances batch transport.
  'table-import': {
    detail: {
      component: TableImportSurface,
      ownsActionSurface: true,
      props: ({ entity, typeId }) => ({ entity, typeId })
    }
  }
};

/**
 * Generic instance-backed persistence: loads text from the payload
 * download URL, saves through the revisioned instance payload transport
 * (which records an immutable content revision per save). Editors'
 * surface adapters project this onto their own contract shapes.
 */
export function instancePayloadPersistence(entity = {}, typeId = '', mimeType = 'application/octet-stream') {
  const payloadUrl = instancePayloadFileUrl(entity.attachments?.primary);
  const instanceId = String(entity._id || '');
  return {
    title: entity.identity?.name || '',
    load: async () => {
      if (!payloadUrl) return '';
      const response = await fetch(payloadUrl);
      if (!response.ok) return '';
      return await response.text();
    },
    save: async (text, filename) => {
      const form = new FormData();
      form.append('file', new File([text], filename, { type: mimeType }));
      return await $fetch(`/api/instances/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}/payload`, { method: 'PUT', body: form });
    }
  };
}

/**
 * Sketch-scoped projection of the instance persistence: the scene
 * contract (`loadScene`/`saveScene`; origin stays artifact-path-only).
 */
export function sketchInstancePersistence(entity = {}, typeId = 'sketch') {
  const base = instancePayloadPersistence(entity, typeId, 'application/json');
  return {
    title: base.title,
    loadScene: base.load,
    saveScene: (sceneText, filename) => base.save(sceneText, filename)
  };
}

/**
 * Text/csv-scoped projection of the instance persistence. Text documents
 * are markdown by default: the editor surface converts on load/save and
 * saves with the markdown extension and mime.
 */
export function textInstancePersistence(entity = {}, typeId = '', format = 'text') {
  const markdown = format === 'text';
  const base = instancePayloadPersistence(entity, typeId, markdown ? 'text/markdown' : 'text/csv');
  return {
    title: base.title,
    extension: markdown ? '.md' : '.csv',
    loadText: base.load,
    saveText: base.save
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
// silently missing editor presentation.
export const packEditorBindings = validateEditorBindings([...documentsEditors, ...techDrawingEditors, ...facadeEditors]);

// Served-list default (editor-binding guard): when the app has fetched
// the organization type view, the served editor list is the authoritative
// binding source, read through the `useFileTypeView` cache. The pack
// import above stays as the explicit fallback for contexts without a
// fetched view — module-scope evaluation, unit specs, and pre-auth
// shells. A loaded-but-empty served list also falls back: today every
// served editor comes from the mounted packs, so empty can only mean
// "nothing fetched for this context".
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

/**
 * Resolve one file type's surface record from editor bindings. Returns
 * `null` when the type has no editor binding or the bound surface has no
 * app presentation. Omitting `editors` resolves against the served editor
 * list when the organization type view has been fetched, with the pack
 * bindings as the documented fallback.
 */
export function resolveFileSurface(editors = activeEditorBindings(), typeId = '') {
  const editor = (editors || []).find(item => item?.type === typeId && fileSurfaceRegistry[item.surface]);
  if (!editor) return null;
  const surface = fileSurfaceRegistry[editor.surface];
  return {
    typeId,
    surface: editor.surface,
    modes: [...(editor.modes || [])],
    detail: surface.detail || null,
    action: surface.action || null,
    workspacePage: surface.workspacePage || null,
    forcesIdentity: Boolean(surface.forcesIdentity)
  };
}

/**
 * Derive generated instance-detail overload rows for every bound file type:
 * one row per editor binding whose surface has a detail presentation.
 */
export function fileDetailOverloads(editors = activeEditorBindings()) {
  return (editors || [])
    .map(editor => {
      const surface = resolveFileSurface(editors, editor.type);
      return surface?.detail
        ? {
            typeId: editor.type,
            component: surface.detail.component,
            ownsActionSurface: Boolean(surface.detail.ownsActionSurface),
            props: context => surface.detail.props({ ...context, typeId: editor.type })
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Derive registered workspace-page rows for every bound file type whose
 * surface has a pane presentation. Page ids are the surface ids, so
 * persisted pane state stays stable.
 */
export function fileWorkspacePages(editors = activeEditorBindings()) {
  return (editors || [])
    .map(editor => {
      const surface = resolveFileSurface(editors, editor.type);
      return surface?.workspacePage
        ? {
            id: editor.surface,
            typeId: editor.type,
            labelKey: surface.workspacePage.labelKey,
            icon: surface.workspacePage.icon,
            component: surface.workspacePage.component,
            props: surface.workspacePage.props
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Derive editor-action rows: every bound file type resolves its action
 * component and identity policy from the surface registry.
 */
export function fileEditorActions(editors = activeEditorBindings()) {
  return (editors || [])
    .map((editor) => {
      const surface = resolveFileSurface(editors, editor.type);
      return surface
        ? [editor.type, { component: surface.action || null, forceIdentity: surface.forcesIdentity }]
        : null;
    })
    .filter(Boolean);
}

// The pure payload-preview decision helpers live in the component-free
// `file-preview.js` leaf (same contract home); re-exported here for the
// editor-surface consumers that already import from this module.
export { instancePayloadFileUrl, resolveFilePreview } from './file-preview-contract.js';
