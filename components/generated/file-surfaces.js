import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedFacadeDesignerWorkspacePage from '~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue';
import GeneratedFacadePatternDesignerWorkspacePage from '~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import SketchEditor from '~/components/artifacts/SketchEditor.vue';
import ArtifactTextEditor from '~/components/artifacts/ArtifactTextEditor.vue';
import { cncEditors } from '@cutkit/domain-cnc';
import { techDrawingEditors } from '~/packages/tech-drawing/src/index.js';
import { documentsEditors } from '~/packages/documents/src/index.js';
import { instancePayloadFileUrl } from './file-preview.js';

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
  'facade-designer': {
    detail: {
      component: GeneratedFacadeDesignerWorkspacePage,
      props: ({ entity }) => ({ facade: entity })
    }
  },
  'facade-pattern-designer': {
    detail: {
      component: GeneratedFacadePatternDesignerWorkspacePage,
      props: ({ entity }) => ({ facadePattern: entity })
    }
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
 * Text/csv-scoped projection of the instance persistence.
 */
export function textInstancePersistence(entity = {}, typeId = '', format = 'text') {
  const base = instancePayloadPersistence(entity, typeId, format === 'csv' ? 'text/csv' : 'text/plain');
  return {
    title: base.title,
    loadText: base.load,
    saveText: base.save
  };
}

// The mounted packs' editor bindings in composition order — the same
// records the cts-types feature serves with the organization type view.
export const packEditorBindings = [...documentsEditors, ...techDrawingEditors, ...cncEditors];

/**
 * Resolve one file type's surface record from editor bindings. Returns
 * `null` when the type has no editor binding or the bound surface has no
 * app presentation. The served editor list can be passed in place of the
 * pack import.
 */
export function resolveFileSurface(editors = packEditorBindings, typeId = '') {
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
 * Derive generated entity-detail overload rows for every bound file type:
 * one row per editor binding whose surface has a detail presentation.
 */
export function fileDetailOverloads(editors = packEditorBindings) {
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
export function fileWorkspacePages(editors = packEditorBindings) {
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
export function fileEditorActions(editors = packEditorBindings) {
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
export { instancePayloadFileUrl, resolveFilePreview } from './file-preview.js';
