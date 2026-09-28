import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
// Cyclic pair: GeneratedEditorPageAction imports resolveFileSurface from
// here, so the registry reads it through lazy getters (module-init order
// would otherwise hit an uninitialized binding).
import GeneratedEditorPageAction from '~/components/generated/GeneratedEditorPageAction.vue';
import TableImportSurface from '~/components/generated/TableImportSurface.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import SketchEditor from '~/components/artifacts/SketchEditor.vue';
import ArtifactTextEditor from '~/components/artifacts/ArtifactTextEditor.vue';
import { facadeEditors } from '@perigram/facade';
import { techDrawingEditors } from '~/packages/tech-drawing/src/index.js';
import { documentsEditors } from '~/packages/documents/src/index.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useInstancesStore } from '~/stores/instances';
import { unref } from 'vue';
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
 * - `action`: the card/detail editor-action button component that opens
 *   the page (the cassette designer keeps its own action component for its
 *   dialog persistence flows).
 */
export const fileSurfaceRegistry = {
  'cassette-designer': {
    action: GeneratedCassetteDesignerAction,
    workspacePage: {
      labelKey: 'cassette.designerTitle',
      icon: 'pi pi-file-edit',
      component: GeneratedCassetteDesignerWorkspacePage,
      props: page => ({ cassette: page.entity, cassettes: page.cassettes || [] })
    }
  },
  'sheet-design-editor': {
    get action() { return GeneratedEditorPageAction; },
    workspacePage: {
      labelKey: 'sheetDesign.editor',
      icon: 'pi pi-file-edit',
      component: SheetDesignEditor,
      props: page => ({ design: page.entity })
    }
  },
  'sketch-editor': {
    get action() { return GeneratedEditorPageAction; },
    workspacePage: {
      labelKey: 'sketch.editorTitle',
      icon: 'pi pi-file-edit',
      component: SketchEditor,
      props: (page, typeId) => ({ persistence: sketchInstancePersistence(page.entity, typeId) })
    }
  },
  'text-editor': {
    get action() { return GeneratedEditorPageAction; },
    workspacePage: {
      labelKey: 'editors.text',
      icon: 'pi pi-file-edit',
      component: ArtifactTextEditor,
      props: (page, typeId) => ({
        persistence: textInstancePersistence(page.entity, typeId, 'text'),
        format: 'text'
      })
    }
  },
  'csv-editor': {
    get action() { return GeneratedEditorPageAction; },
    workspacePage: {
      labelKey: 'editors.csv',
      icon: 'pi pi-file-edit',
      component: ArtifactTextEditor,
      props: (page, typeId) => ({
        persistence: textInstancePersistence(page.entity, typeId, 'csv'),
        format: 'csv'
      })
    }
  },
  // The workbook's editor is the import mapper: parse the payload
  // client-side, map columns onto a target type's declared vocabulary,
  // construct through the instances batch transport.
  'table-import': {
    get action() { return GeneratedEditorPageAction; },
    workspacePage: {
      labelKey: 'tableImport.title',
      icon: 'pi pi-table',
      component: TableImportSurface,
      props: (page, typeId) => ({ entity: page.entity, typeId })
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
    },
    rename: async (name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      return await useInstancesStore().mutateDirect(useInstancesStore().canonicalTypeKey(typeId), 'PATCH', {
        id: instanceId,
        body: { identity: { name: trimmed } },
        meta: { change: 'updated', reason: 'editor-rename' }
      });
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
    saveScene: (sceneText, filename) => base.save(sceneText, filename),
    rename: base.rename
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
    saveText: base.save,
    rename: base.rename
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
    action: surface.action || null,
    workspacePage: surface.workspacePage || null
  };
}

/**
 * Derive registered workspace-page rows for every bound file type whose
 * surface has a pane presentation. Page ids are the surface ids, so
 * persisted pane state stays stable; the props adapter receives the page
 * record and the bound type id (one surface may serve several types).
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
            props: page => surface.workspacePage.props(page, editor.type)
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Derive editor-action rows: every bound file type resolves the action
 * component that opens its editor page.
 */
export function fileEditorActions(editors = activeEditorBindings()) {
  return (editors || [])
    .map((editor) => {
      const surface = resolveFileSurface(editors, editor.type);
      return surface?.action
        ? [editor.type, { component: surface.action }]
        : null;
    })
    .filter(Boolean);
}

// The pure payload-preview decision helpers live in the component-free
// `file-preview.js` leaf (same contract home); re-exported here for the
// editor-surface consumers that already import from this module.
export { instancePayloadFileUrl, resolveFilePreview } from './file-preview-contract.js';
