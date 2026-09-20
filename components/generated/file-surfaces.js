import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedFacadeDesignerWorkspacePage from '~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import { cncEditors } from '@cutkit/domain-cnc';

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
  }
};

// The mounted pack's editor bindings — the same records the cts-types
// feature serves with the organization type view.
export const packEditorBindings = cncEditors;

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
            entityType: editor.type,
            component: surface.detail.component,
            ownsActionSurface: Boolean(surface.detail.ownsActionSurface),
            props: surface.detail.props
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
            entityType: editor.type,
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
