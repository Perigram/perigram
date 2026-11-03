// The facade plugin's cassette designer surface (surface contract 2).
// The mounted module receives the cassette record and the generic
// persistence callbacks; templates and profile templates ride the
// cross-type query/record transports; the OCCS engine and the render
// family are the plugin's own lib. The three.js folded-preview runtime
// is vendored beside the plugin.
import {
  addCassetteV2GraphChild,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2ProfileWorkpiece,
  addCassetteV2WorkpieceAttachment,
  addCassetteV2Workpiece,
  CASSETTE_V2_HANGER_PRODUCTION_MODES,
  CASSETTE_V2_HARDWARE_FAMILIES,
  cassetteV2AttachableProfileEdgesForTree,
  cassetteV2FaceSketchContext,
  cassetteV2SketchContext,
  collectCassetteV2ExpressionIdentifiers,
  renameCassetteV2TreeParameter,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  deleteCassetteV2WorkpieceRelation,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  isCassetteV2ProfileWorkpiece,
  normalizeCassetteV2Profile,
  OCCS_CASSETTE_FACE_ROLES,
  renderCassetteV2TreeToDrawing,
  cassetteV2LayerPanelRows,
  resolveCassetteV2AngleExpression,
  resolveCassetteV2Expression,
  resolveCassetteV2FaceSketchRegion,
  updateCassetteV2FaceSketch,
  updateCassetteV2GraphNode,
  updateCassetteV2Workpiece,
  updateCassetteV2WorkpieceRelation
} from './lib/cassetteV2Renderer.js';
import { occsParameterSource } from '../occs/parameters.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  buildOccsProfileFromEvaluatedSketch,
  closeOccsProfileSketchBoundary,
  createEmptyOccsProfileSketch,
  inspectOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occsProfileFromSketch,
  pruneScopeBoundParameters,
  resolveOccsProfileSketchLayerData
} from '../occs/profiles.js';
import createExpressionEditor from './lib/components/expressionEditor.mjs';
import createFieldDraft from './lib/components/fieldDraft.mjs';
import createFoldedPreview from './lib/components/foldedPreview.mjs';
import createSketchEditor from './lib/components/sketchEditor.mjs';
import {
  beginCanvasSession,
  canvasSketchView,
  createCanvasSession,
  endCanvasSession,
  rememberCanvasSketchView
} from './lib/canvasSession.js';
import { buildCassetteV2FoldedPreview } from './lib/cassetteV2FoldedPreview.js';
import { cassettePreviewLayerSelection, normalizeGeometryDrawing } from './lib/drawingPreview.js';
import { evaluateOccsCassetteTemplate } from '../occs/evaluate.js';
import { hardwareDefaultParameters, hardwareLabel } from '../occs/hardware.js';

const OCCS_MIME = 'application/perigram+occs';

const ATTACHMENT_SHORT_LABELS = Object.freeze({
  'cassette.v2.attachmentFields.targetFace': 'cassette.v2.attachmentFields.short.targetFace',
  'cassette.v2.attachmentFields.targetSnap': 'cassette.v2.attachmentFields.short.targetSnap',
  'cassette.v2.attachmentFields.edgeMargin': 'cassette.v2.attachmentFields.short.edgeMargin',
  'cassette.v2.attachmentFields.normalOffset': 'cassette.v2.attachmentFields.short.normalOffset',
  'cassette.v2.attachmentFields.rotation': 'cassette.v2.attachmentFields.short.rotation',
  'cassette.v2.attachmentFields.placementMode': 'cassette.v2.attachmentFields.short.placementMode',
  'cassette.v2.attachmentFields.arrayEdge': 'cassette.v2.attachmentFields.short.arrayEdge',
  'cassette.v2.attachmentFields.arrayMode': 'cassette.v2.attachmentFields.short.arrayMode',
  'cassette.v2.attachmentFields.side': 'cassette.v2.attachmentFields.short.side',
  'cassette.v2.attachmentFields.sourceFace': 'cassette.v2.attachmentFields.short.sourceFace',
  'cassette.v2.attachmentFields.sourceSnap': 'cassette.v2.attachmentFields.short.sourceSnap'
});

const expressionErrorOf = (value, parameters, emptyMessage, allowEmpty = false) => {
  const text = String(value ?? '').trim();
  if (!text) return allowEmpty ? '' : emptyMessage;
  try {
    resolveCassetteV2Expression(text, parameters);
    return '';
  } catch (error) {
    return error?.message || String(error);
  }
};

// §3 wire: records carry `name` — the label helper takes the plain
// candidates; an unnamed record reads as unnamed, its id never renders.
const entitySelectText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  }
  return '';
};
const entitySelectLabel = (entity, fallback = '') => entitySelectText(
  entity?.name, entity?.label, entity?.title,
  entity?.code, fallback
);

// Snapshot undo/redo history, module-local (the editor owns its stack).
// The gate flags are real refs from the injected runtime — a plain getter
// would freeze the toolbar's disabled state.
function snapshotHistory({ ref, snapshot, apply, limit = 50 } = {}) {
  const canUndo = ref(false);
  const canRedo = ref(false);
  const state = { past: [], future: [], baseline: null };
  const gate = () => {
    canUndo.value = state.past.length > 0;
    canRedo.value = state.future.length > 0;
  };
  return {
    canUndo,
    canRedo,
    reset() {
      state.past = [];
      state.future = [];
      state.baseline = snapshot();
      gate();
    },
    sync() {
      state.baseline = snapshot();
    },
    commit() {
      const current = snapshot();
      if (state.baseline === null || current === state.baseline) {
        state.baseline = current;
        return;
      }
      state.past = [...state.past, state.baseline].slice(-limit);
      state.future = [];
      state.baseline = current;
      gate();
    },
    undo() {
      if (!state.past.length) return;
      const current = snapshot();
      const previous = state.past[state.past.length - 1];
      state.past = state.past.slice(0, -1);
      state.future = [current, ...state.future].slice(0, limit);
      apply(previous);
      state.baseline = snapshot();
      gate();
    },
    redo() {
      if (!state.future.length) return;
      const current = snapshot();
      const next = state.future[0];
      state.future = state.future.slice(1);
      state.past = [...state.past, current].slice(0, limit);
      apply(next);
      state.baseline = snapshot();
      gate();
    }
  };
}

// Parameter table of an OCCS template payload, read by the host's
// cassettes-parameters create control through the served surface module.
export function parametersOf(text = '') {
  try {
    return occsParameterSource(JSON.parse(String(text)));
  } catch {
    return {};
  }
}

export default function createSurface({ vue, components, locale, queries, records, notify, access }) {
  const { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;

  if (!queries || !records || !notify || !access) {
    throw new Error('cassette-designer requires the contract-2 mount context');
  }

  const CassetteExpressionEditor = createExpressionEditor({ vue, components, locale });
  const parameterNameDraft = createFieldDraft({ vue });
  const attachmentDraft = createFieldDraft({ vue });
  const CassetteFoldedPreview = createFoldedPreview({ vue, components, locale });
  const ProfileSketchEditor = createSketchEditor({ vue, components, locale });
  const { DrawingCanvas, DesignerSurface, DesignerWorkspace, StandardDialog, Popover, Button, Checkbox, InputText, InputNumber, IftaLabel, Divider, Message, ScrollPanel, Select, Tag, InstanceSelect } = components;

  return defineComponent({
    name: 'CassetteDesignerV2',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const isClient = () => typeof window !== 'undefined';

      const cassetteTree = ref(createCassetteV2GraphTree());
      const cassetteNameDraft = ref(t('cassette.newCassette'));
      const selectedNodeId = ref(cassetteTree.value.rootId);
      const selectedWorkpieceOverrideId = ref('');
      const selectedRelationId = ref('');
      const inspectorSelection = ref('face');
      const editorSurfaceRef = ref(null);
      const drawingCanvasRef = ref(null);
      const inlineEditor = ref(null);
      const attachmentPicker = ref(null);
      const attachmentPickerSourceId = ref('');
      const foldedPreviewWorkpieceId = ref('');
      const foldedExpanded = ref(false);
      const previewSource = ref(null);
      const cassettePreviewSource = ref(null);
      const previewError = ref('');
      const dockMenu = ref(null);
      const dockPopoverPanel = ref(null);

      const standards = ref([]);
      const pens = ref([]);
      let layerStoresPromise = null;
      const loadLayerStores = async () => {
        layerStoresPromise ||= Promise.all([
          queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {}),
          queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {})
        ]);
        await layerStoresPromise;
      };

      function openDockPopover(panel, event) {
        dockPopoverPanel.value = panel;
        if (panel === 'open') loadTemplateRecords();
        dockMenu.value?.toggle?.(event);
      }

      function closeDockPopover() {
        dockPopoverPanel.value = null;
        dockMenu.value?.hide?.();
      }

      const documentDockItems = computed(() => [
        {
          icon: 'pi pi-folder-open',
          label: t('cassette.v2.loadTemplate'),
          onClick: event => openDockPopover('open', event),
          hasPopup: true
        },
        {
          icon: 'pi pi-pencil',
          label: t('common.rename'),
          onClick: event => openDockPopover('rename', event),
          hasPopup: true
        },
        { separator: true },
        {
          icon: 'pi pi-copy',
          label: t('common.saveAs'),
          onClick: () => saveTemplate({ saveAs: true })
        },
        {
          icon: 'pi pi-save',
          label: t('common.save'),
          onClick: () => saveTemplate()
        },
        { separator: true },
        {
          icon: 'pi pi-refresh',
          label: t('common.reset'),
          onClick: resetTree
        }
      ]);

      const canvasDockItems = computed(() => [
        {
          icon: 'pi pi-undo',
          label: t('common.undo'),
          disabled: !canUndo.value,
          onClick: undoDesignerChange
        },
        {
          icon: 'pi pi-replay',
          label: t('common.redo'),
          disabled: !canRedo.value,
          onClick: redoDesignerChange
        },
        { separator: true },
        {
          icon: 'pi pi-search-minus',
          label: t('drawing.zoomOut'),
          onClick: () => drawingCanvasRef.value?.zoomOut()
        },
        {
          icon: 'pi pi-search-plus',
          label: t('drawing.zoomIn'),
          onClick: () => drawingCanvasRef.value?.zoomIn()
        },
        {
          icon: 'pi pi-refresh',
          label: t('drawing.resetView'),
          onClick: () => drawingCanvasRef.value?.resetView()
        },
        { separator: true },
        {
          icon: 'pi pi-wave-pulse',
          label: t('cassette.v2.addProfile'),
          onClick: event => openProfilePicker(event)
        }
      ]);

      const drawingLayers = ref([]);
      const visibleLayerNames = ref([]);
      const hiddenLayerNames = ref([]);
      const loadedTemplateId = ref('');
      const persistedTemplateIdOverride = ref('');
      // The record a blank editor tab created on its first save — later
      // saves on the same tab update it instead of creating again.
      let blankCreatedTarget = null;
      const sessionDraftAvailable = ref(false);
      const onboardingIndex = ref(0);
      const onboardingDismissed = ref(false);
      const inlineEditorDrag = ref(null);
      // The focused profile-parameter chip's raw text (see fieldDraft).
      const profileSketchOpen = ref(false);
      const editingProfileWorkpieceId = ref('');
      // Every profile sketch drafts blank (owner decision 2026-10-17):
      // empty canvas, empty table — geometry and parameters are authored,
      // never seeded from the template.
      const profileDraft = ref({
        name: '',
        kind: 'hanger',
        process: 'extruded',
        preservedInstance: {},
        sketch: createEmptyOccsProfileSketch()
      });
      const profileLibraryRecords = ref([]);
      const profileLibraryAvailable = ref(true);
      const profileDeletePopover = ref(null);
      const profileLibraryOptions = computed(() => profileLibraryRecords.value.map(record => ({
        label: record?.name || t('common.unnamed'),
        value: record?._id?.toString(),
        entity: record,
        typeId: 'profile'
      })));
      const profilePicker = ref(null);
      const faceSketchOpen = ref(false);
      const editingFaceNodeId = ref('');
      const faceShapeDraft = ref(createEmptyOccsProfileSketch());
      const faceShapeBasisStart = ref(null);
      const faceShapeBasisEnd = ref(null);
      const faceShapeParentFace = ref([]);
      const faceShapeEditorError = ref('');
      const faceShapeSketchError = computed(() => faceShapeEditorError.value);
      const faceShapeDraftSketch = computed(() => normalizeOccsProfileSketch(faceShapeDraft.value));
      const faceShapeInspection = computed(() => inspectOccsProfileSketch(
        faceShapeDraftSketch.value,
        globalParameters.value
      ));
      const faceShapeReady = computed(() => (
        faceShapeInspection.value.savable
        && faceShapeDraftSketch.value.shapes.some(shape => shape.op === 'add')
      ));
      const sketchMode = computed(() => (
        faceSketchOpen.value ? 'face' : profileSketchOpen.value ? 'profile' : ''
      ));
      // The assembly canvas stays mounted under the sketch mode so its
      // viewport survives the flip; the editor mounts once per surface.
      const sketchEditorMounted = ref(false);
      const sketchEditorMode = ref('profile');
      const sketchEditorRef = ref(null);
      const canvasSession = createCanvasSession();
      const sketchInitialView = ref(null);
      const sketchSessionKey = ref(0);
      const sketchContextEntities = ref([]);
      let sketchContextToken = 0;
      const hardwareLibraryRecords = ref([]);
      const hardwareLibraryAvailable = ref(true);
      const hardwarePicker = ref(null);
      const hardwareDialogVisible = ref(false);
      const hardwareDraft = ref(createHardwareDraft());

      function createHardwareDraft(family = 'bolt') {
        return {
          name: '',
          family,
          productionMode: family === 'hanger_clip' ? 'integralCut' : '',
          parameters: { ...hardwareDefaultParameters(family) }
        };
      }
      const templateRecords = ref([]);
      const loadedDocument = ref(null);

      const profileDraftSketch = computed(() => normalizeOccsProfileSketch(
        profileDraft.value.sketch || createEmptyOccsProfileSketch()
      ));
      // The sketch mode edits the authored profile. Placement overrides stay
      // on the workpiece and never enter this evaluation.
      const profileDraftInspection = computed(() => inspectOccsProfileSketch(
        profileDraftSketch.value,
        globalParameters.value
      ));
      const profileDraftReady = computed(() => profileDraftInspection.value.savable);
      // The refused save states its reason beside the button — a greyed
      // Save with no voice loses authored sessions.
      const profileDraftError = computed(() => profileDraftInspection.value.error);
      // The sketch mode carries the one error voice: the save gate's refusal,
      // the editor's outline refusal, or the participation gate.
      const profileEditorError = ref('');
      const profileSketchError = computed(() => (
        profileDraftError.value
        || profileEditorError.value
        || (profileDraftReady.value ? '' : t('cassette.v2.profileEditor.invalidSketch'))
      ));
      const preparedProfileDraftSketch = computed(() => closeOccsProfileSketchBoundary(
        profileDraftSketch.value
      ));
      // Library records store the authored sketch alone, so they place
      // only when that table resolves without a workpiece's overrides.
      const profileDraftAuthoredReady = computed(() => isOccsProfileSketchSavable(
        preparedProfileDraftSketch.value
      ));

      const selectedTemplateId = computed(() => persistedTemplateIdOverride.value || props.record?._id || '');
      const autosaveStorageKey = computed(() => `perigram:cassette-designer-v2:draft:${selectedTemplateId.value || 'draft'}`);
      const inlineEditorPositionKey = 'perigram:cassette-designer-v2:inline-editor-position';
      const onboardingStorageKey = 'perigram:onboarding:cassette-designer-v2';
      const cassetteMarkContext = computed(() => ({
        templateName: cassetteNameDraft.value || t('cassette.newCassette'),
        templateId: selectedTemplateId.value || 'draft'
      }));
      const treeNodes = computed(() => cassetteTree.value.nodes || []);
      const selectedNode = computed(() => treeNodes.value.find(node => node.id === selectedNodeId.value) || treeNodes.value[0] || null);
      const workpieces = computed(() => getCassetteV2Workpieces(cassetteTree.value));
      const selectedWorkpieceId = computed(() => inspectorSelection.value
        ? selectedWorkpieceOverrideId.value || selectedNode.value?.workpieceId || workpieces.value[0]?.id || ''
        : '');
      const selectedWorkpiece = computed(() => selectedWorkpieceId.value
        ? workpieces.value.find(workpiece => workpiece.id === selectedWorkpieceId.value) || null
        : null);
      const workpieceRelations = computed(() => getCassetteV2WorkpieceRelations(cassetteTree.value));
      const previewMode = computed(() => (
        inspectorSelection.value === 'workpiece' || inspectorSelection.value === 'attachment'
          ? 'assembly'
          // A profile owns no face: its solo view is empty geometry, so a
          // selected profile previews the assembly it is placed in — the
          // geometry its instance parameters actually drive.
          : isCassetteV2ProfileWorkpiece(selectedWorkpiece.value || {})
            ? 'assembly'
            : 'workpiece'
      ));
      const previewWorkpieceId = computed(() => previewMode.value === 'workpiece' ? selectedWorkpieceId.value : '');
      const selectedWorkpieceRelations = computed(() => workpieceRelations.value
        .filter(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value)
        .sort((left, right) => left.id.localeCompare(right.id)));
      const selectedWorkpieceRelation = computed(() => (
        workpieceRelations.value.find(relation => relation.id === selectedRelationId.value) ||
        selectedWorkpieceRelations.value.find(relation => relation.driver) ||
        selectedWorkpieceRelations.value[0] ||
        null
      ));
      const workpieceById = computed(() => new Map(workpieces.value.map(workpiece => [workpiece.id, workpiece])));
      const foldedPreviewDiagnostics = computed(() => buildCassetteV2FoldedPreview(cassettePreviewSource.value?.foldedPreview || {}));
      const relationDiagnosticsById = computed(() => new Map(
        (foldedPreviewDiagnostics.value.attachments || []).map(attachment => [attachment.id, attachment])
      ));
      const profileEmbeddingErrorById = computed(() => new Map(
        (previewSource.value?.profileEmbeddingErrors || []).map(error => [error.relationId, error.reason])
      ));
      const assemblySummary = computed(() => `${workpieces.value.length}/${workpieceRelations.value.length}`);
      const workpieceLabel = (workpieceId) => {
        const workpiece = workpieceById.value.get(workpieceId);
        return workpiece?.name || workpieceId || '';
      };
      const workpieceRelationRowsById = computed(() => {
        // Breadcrumb segments naming where the attachment lands: the
        // binding face, plus the arranged edge for edge-array placements.
        const relationCrumbs = (relation) => [
          relation.targetFaceId || null,
          relation.placementMode === 'edgeArray' && relation.arrayEdge ? relation.arrayEdge : null
        ].filter(Boolean);
        const rows = new Map(workpieces.value.map(workpiece => [workpiece.id, []]));
        for (const relation of workpieceRelations.value) {
          const status = profileEmbeddingErrorById.value.has(relation.id)
            ? 'refused'
            : relationDiagnosticsById.value.get(relation.id)?.status || 'ok';
          if (relation.sourceWorkpieceId) {
            rows.get(relation.sourceWorkpieceId)?.push({
              relation,
              direction: 'out',
              otherLabel: workpieceLabel(relation.targetWorkpieceId),
              crumbs: relationCrumbs(relation),
              status
            });
          }
          if (relation.targetWorkpieceId) {
            rows.get(relation.targetWorkpieceId)?.push({
              relation,
              direction: 'in',
              otherLabel: workpieceLabel(relation.sourceWorkpieceId),
              crumbs: relationCrumbs(relation),
              status
            });
          }
        }
        return rows;
      });
      // The workpiece row carries the profile's whole parameter table
      // (the item is the profile's parameter home on the cassette). A
      // chip shows its stored expression and edits the instance table
      // (workers/facade/SPEC.md — two parameter tables).
      const profileRowOf = (workpiece) => (
        isCassetteV2ProfileWorkpiece(workpiece)
          ? normalizeCassetteV2Profile(workpiece, globalParameters.value)
          : null
      );
      // Tree law (owner, 2026-10-17): every workpiece renders as a
      // top-level row — sheets and hardware never nest under each
      // other. Only profile workpieces nest, once, under the workpiece
      // their single attachment relation targets; every other relation
      // renders as a relation row under its workpiece.
      const nestedWorkpieceIds = computed(() => new Set(workpieces.value
        .filter(workpiece => isCassetteV2ProfileWorkpiece(workpiece)
          && workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length === 1)
        .map(workpiece => workpiece.id)));
      const workpieceRows = computed(() => workpieces.value.map((workpiece) => {
        const profile = profileRowOf(workpiece);
        const authoredParameters = profile ? profile.sketch.parameters : null;
        const instanceParameters = profile ? profile.instance : null;
        return {
          id: workpiece.id,
          label: workpiece.name || workpiece.id,
          type: workpiece.type || 'sheet',
          family: workpiece.family || workpiece.hardware?.family || '',
          productionMode: workpiece.productionMode || workpiece.hardware?.productionMode || '',
          parameters: profile ? profile.parameters : (workpiece.parameters || workpiece.hardware?.parameters || {}),
          authoredParameters,
          instanceParameters,
          boundParameterKeys: profile
            ? new Set([
                ...Object.keys(authoredParameters || {}),
                ...Object.keys(instanceParameters || {})
              ])
            : null,
          isHardware: Boolean(workpiece.family || workpiece.hardware?.family),
          isProfile: isCassetteV2ProfileWorkpiece(workpiece),
          isNested: nestedWorkpieceIds.value.has(workpiece.id),
          parentCount: workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length,
          relations: workpieceRelationRowsById.value.get(workpiece.id) || []
        };
      }));
      const relationStatusSeverity = (status) => {
        if (status === 'impossible' || status === 'refused') return 'danger';
        if (status === 'unresolved') return 'warn';
        return 'secondary';
      };
      // Attachment settings are per source kind (owner decision
      // 2026-10-17): profiles embed (edge array / point placement, no
      // joint semantics, no face side), hardware places on a face side
      // (snap or array, no mirror, no joint), and workpiece attachments
      // carry the full face-to-face joint placement.
      const attachmentSourceKind = (relation) => {
        const source = workpieceById.value.get(relation.sourceWorkpieceId);
        if (!source) return 'workpiece';
        if (isCassetteV2ProfileWorkpiece(source)) return 'profile';
        if (source.family || source.hardware?.family) return 'hardware';
        return 'workpiece';
      };
      const hueForWorkpiece = (workpieceId = '') => {
        let hash = 0;
        for (const char of String(workpieceId || 'workpiece')) {
          hash = (hash * 31 + char.charCodeAt(0)) % 360;
        }
        return (hash * 137 + 43) % 360;
      };
      const targetFaceOptions = computed(() => treeNodes.value
        .filter(node => node.workpieceId === selectedWorkpieceRelation.value?.targetWorkpieceId)
        .map(node => ({ label: node.id, value: node.id })));
      const sourceFaceOptions = computed(() => treeNodes.value
        .filter(node => node.workpieceId === selectedWorkpieceRelation.value?.sourceWorkpieceId)
        .map(node => ({ label: node.id, value: node.id })));
      const snapOptions = computed(() => ['center', 'start', 'end', 'origin', 'top_left', 'top_right', 'bottom_left', 'bottom_right'].map(anchor => ({
        label: t(`cassette.v2.snapPoints.${anchor}`),
        value: anchor
      })));
      const sideOptions = computed(() => ['front', 'back'].map(side => ({
        label: t(`cassette.v2.sides.${side}`),
        value: side
      })));
      const hardwareFamilyOptions = computed(() => CASSETTE_V2_HARDWARE_FAMILIES.map(family => ({
        label: t(`cassette.v2.hardwareFamilies.${family}`),
        value: family
      })));
      const hangerProductionModeOptions = computed(() => CASSETTE_V2_HANGER_PRODUCTION_MODES.map(mode => ({
        label: t(`cassette.v2.hangerProductionModes.${mode}`),
        value: mode
      })));
      const profileKindOptions = computed(() => OCCS_PROFILE_KINDS.map(kind => ({
        label: t(`cassette.v2.profileKinds.${kind}`),
        value: kind
      })));
      const profileProcessOptions = computed(() => OCCS_PROFILE_PROCESSES.map(process => ({
        label: t(`cassette.v2.profileProcesses.${process}`),
        value: process
      })));
      const placementModeOptions = computed(() => ['point', 'edgeArray'].map(mode => ({
        label: t(`cassette.v2.placementModes.${mode}`),
        value: mode
      })));
      const arrayModeOptions = computed(() => ['count', 'spacing'].map(mode => ({
        label: t(`cassette.v2.arrayModes.${mode}`),
        value: mode
      })));
      const arrayValueLabel = (relation = {}) => (
        relation.arrayMode === 'spacing'
          ? t('cassette.v2.attachmentFields.arraySpacing')
          : t('cassette.v2.attachmentFields.arrayCount')
      );
      const arrayValue = (relation = {}) => (
        relation.arrayMode === 'spacing' ? relation.arraySpacing : relation.arrayCount
      );
      const arrayValuePatch = (relation = {}, value) => ({
        placementMode: 'edgeArray',
        [relation.arrayMode === 'spacing' ? 'arraySpacing' : 'arrayCount']: value
      });
      // A profile never arranges on a fold edge; faces and open profiles
      // may share every other edge through shard placement.
      const faceEdgeCounts = computed(() => previewSource.value?.faceEdgeCounts || {});
      const edgeLengthFor = (faceId, edgeLabel = 'E0') => {
        const match = String(edgeLabel || 'E0').match(/\d+/);
        const edgeIndex = match ? Math.max(0, Math.round(Number(match[0]))) : 0;
        return previewSource.value?.faceEdgeLengths?.[faceId]?.[edgeIndex] ?? NaN;
      };
      const attachableEdgeOptions = (faceId) => cassetteV2AttachableProfileEdgesForTree(
        cassetteTree.value,
        faceId,
        { edgeCountByFaceId: faceEdgeCounts.value }
      )
        .map(edge => ({ label: edge, value: edge }));
      const anchorOptions = computed(() => [
        { label: t('cassette.v2.anchors.start'), value: 0 },
        { label: t('cassette.v2.anchors.end'), value: 1 }
      ]);
      const globalParameters = computed(() => cassetteTree.value.parameters || {});
      const globalParameterNames = computed(() => Object.keys(globalParameters.value)
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })));
      const globalParameterEntries = computed(() => globalParameterNames.value
        .map(key => ({ key, value: globalParameters.value[key] })));
      const selectedDesignerFaceId = computed(() => (
        inspectorSelection.value === 'face' || inspectorSelection.value === 'fold'
          ? selectedNodeId.value
          : null
      ));
      const showDesignerWorkpieceContext = computed(() => (
        previewMode.value === 'assembly' && !selectedDesignerFaceId.value
      ));
      const designerSelectableWorkpieceIds = computed(() => {
        if (inspectorSelection.value === 'attachment' && selectedWorkpieceRelation.value) {
          return [
            selectedWorkpieceRelation.value.sourceWorkpieceId,
            selectedWorkpieceRelation.value.targetWorkpieceId
          ].filter(Boolean);
        }
        return selectedWorkpieceId.value ? [selectedWorkpieceId.value] : [];
      });
      const drawingCanvasSource = computed(() => previewSource.value);
      const selectedExpressionParameters = computed(() => {
        const scope = { ...globalParameters.value };
        if (selectedNode.value?.parentId) {
          scope.parentEdgeIndex = selectedNode.value.parentEdgeIndex ?? 0;
          try {
            scope.foldAngle = resolveCassetteV2AngleExpression(selectedNode.value.foldAngle || '90', globalParameters.value);
          } catch {
            scope.foldAngle = '';
          }
        }
        return scope;
      });
      const selectedExpressionContextTokens = computed(() => {
        if (!selectedNode.value?.parentId) return [];
        return [
          {
            key: 'foldAngle',
            label: 'foldAngle',
            insert: 'foldAngle',
            iconText: '∠',
            tooltip: t('cassette.v2.expression.angleAlias'),
            ariaLabel: t('cassette.v2.expression.angleAlias')
          }
        ];
      });
      const inlineEditorParameters = computed(() => {
        if (inlineEditor.value?.type === 'foldAngle') return globalParameters.value;
        return selectedExpressionParameters.value;
      });
      const inlineEditorContextTokens = computed(() => (
        inlineEditor.value?.type === 'faceParameter' ? selectedExpressionContextTokens.value : []
      ));
      const inlineEditorNode = computed(() => (
        inlineEditor.value?.nodeId
          ? treeNodes.value.find(node => node.id === inlineEditor.value.nodeId) || null
          : null
      ));
      const inlineEditorRelation = computed(() => (
        inlineEditor.value?.relationId
          ? workpieceRelations.value.find(relation => relation.id === inlineEditor.value.relationId) || null
          : null
      ));
      const inlineEditorAnchorKey = computed(() => {
        if (inlineEditor.value?.type !== 'faceParameter') return '';
        if (inlineEditor.value.key === 'baseStartOffset') return 'startAnchor';
        if (inlineEditor.value.key === 'baseEndOffset') return 'endAnchor';
        return '';
      });
      const inlineEditorAnchorValue = computed(() => inlineEditorNode.value?.parameters?.[inlineEditorAnchorKey.value] ?? 0);
      const inlineEditorFaceRole = computed(() => defaultFaceRole(inlineEditorNode.value));
      const faceRoleOptions = computed(() => OCCS_CASSETTE_FACE_ROLES.map(role => ({
        label: role,
        value: role
      })));
      const usedParameterNames = computed(() => {
        const used = new Set();
        const addIdentifiers = (value) => {
          try {
            collectCassetteV2ExpressionIdentifiers(value).forEach(identifier => used.add(identifier));
          } catch {
            // Incomplete edits are allowed; preview validation handles invalid expressions.
          }
        };
        Object.values(globalParameters.value).forEach(addIdentifiers);
        treeNodes.value.forEach((node) => {
          Object.values(node.parameters || {}).forEach(addIdentifiers);
          if (node.foldAngle) addIdentifiers(String(node.foldAngle).replace(/\s*deg\s*$/i, ''));
        });
        return used;
      });
      const drawingLayerNames = computed(() => drawingLayers.value.map(layer => layer.name).filter(Boolean));
      const sameEntityId = (left, right) => left?.toString?.() === right?.toString?.();
      const standardCodeOf = (standard) => standard?.fields?.code || null;
      // Full registry panel: every old-standard layer is listed whether
      // the drawing carries it or not; the org's authored standard
      // (shadow-by-code) still overrides the swatch when present.
      const layerRows = computed(() => cassetteV2LayerPanelRows({ layers: drawingLayers.value }).map(row => {
        const standard = row.code
          ? standards.value.find(item => standardCodeOf(item) === row.code) || null
          : null;
        const orgPen = row.layer
          ? pens.value.find(item => sameEntityId(item._id, row.layer.penId)) || null
          : null;
        const label = row.layer?.role === 'section' ? t('cassette.v2.sectionLayer') : row.name;
        return { ...row, label, standard, orgPen };
      }));
      const onboardingSteps = computed(() => [
        {
          id: 'document',
          type: 'toolbar',
          titleKey: 'cassette.v2.onboarding.document.title',
          bodyKey: 'cassette.v2.onboarding.document.body'
        },
        {
          id: 'canvas',
          type: 'canvas',
          titleKey: 'cassette.v2.onboarding.canvas.title',
          bodyKey: 'cassette.v2.onboarding.canvas.body'
        },
        {
          id: 'parameters',
          type: 'popup',
          titleKey: 'cassette.v2.onboarding.parameters.title',
          bodyKey: 'cassette.v2.onboarding.parameters.body'
        },
        {
          id: 'topology',
          type: 'rail',
          titleKey: 'cassette.v2.onboarding.topology.title',
          bodyKey: 'cassette.v2.onboarding.topology.body'
        }
      ]);
      const activeOnboardingStep = computed(() => onboardingSteps.value[onboardingIndex.value] || onboardingSteps.value[0]);
      const showOnboardingRail = computed(() => !onboardingDismissed.value && Boolean(activeOnboardingStep.value));
      const onboardingCalloutClass = computed(() => ({
        document: 'left-4 top-4 xl:left-4 xl:top-4',
        canvas: 'left-1/2 top-20 -translate-x-1/2',
        parameters: 'left-4 top-40 xl:left-4 xl:top-52',
        topology: 'right-4 top-24'
      }[activeOnboardingStep.value?.id] || 'left-4 top-4'));
      const onboardingChevronClass = computed(() => ({
        document: '-left-1.5 top-6 border-r-0 border-t-0',
        canvas: 'left-1/2 -top-1.5 -translate-x-1/2 border-b-0 border-r-0',
        parameters: '-left-1.5 top-6 border-r-0 border-t-0',
        topology: '-right-1.5 top-6 border-b-0 border-l-0'
      }[activeOnboardingStep.value?.id] || '-left-1.5 top-6 border-r-0 border-t-0'));

      const cloneDesignerTree = (tree = cassetteTree.value) => JSON.parse(JSON.stringify(tree || createCassetteV2GraphTree()));
      const designerSnapshot = () => JSON.stringify({
        name: cassetteNameDraft.value || t('cassette.newCassette'),
        tree: cloneDesignerTree()
      });

      const applyDesignerSnapshot = (snapshot) => {
        try {
          const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
          cassetteNameDraft.value = parsed.name || t('cassette.newCassette');
          cassetteTree.value = parsed.tree || createCassetteV2GraphTree();
          selectedWorkpieceOverrideId.value = '';
          closeInlineEditor();
        } catch {
          // A malformed snapshot never partial-applies: state stays untouched.
        }
      };

      const designerHistory = snapshotHistory({
        ref,
        snapshot: designerSnapshot,
        apply: applyDesignerSnapshot
      });

      let suppressHistory = false;
      let suppressAutosave = false;
      let autosaveTimer = null;

      const resetDesignerHistory = () => designerHistory.reset();
      const undoDesignerChange = () => designerHistory.undo();
      const redoDesignerChange = () => designerHistory.redo();
      const canUndo = designerHistory.canUndo;
      const canRedo = designerHistory.canRedo;

      const isEditableKeyboardTarget = (target) => {
        const tagName = target?.tagName?.toLowerCase?.();
        return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName));
      };

      // A nested keyboard scope (the CAD canvas in the profile editor)
      // owns its own undo/redo/delete paths; tree shortcuts must not fire
      // through it.
      const isScopedKeyboardTarget = (target) => Boolean(
        typeof target?.closest === 'function' && target.closest('[data-keyboard-scope]')
      );

      const clearDesignerSelection = () => {
        closeInlineEditor();
        selectedNodeId.value = '';
        selectedWorkpieceOverrideId.value = '';
        selectedRelationId.value = '';
        inspectorSelection.value = '';
      };

      const handleDesignerEscape = (event) => {
        if (sketchMode.value) return;
        event.preventDefault();
        event.stopPropagation();
        clearDesignerSelection();
      };

      const handleDesignerKeydown = (event) => {
        if (sketchMode.value || isScopedKeyboardTarget(event.target)) return;
        if (event.key === 'Escape') {
          handleDesignerEscape(event);
          return;
        }
        if (isEditableKeyboardTarget(event.target)) return;
        const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
        const isRedo = (event.ctrlKey || event.metaKey) && (
          event.key.toLowerCase() === 'y' ||
          (event.key.toLowerCase() === 'z' && event.shiftKey)
        );
        if (!isUndo && !isRedo) return;
        event.preventDefault();
        if (isUndo) undoDesignerChange();
        else redoDesignerChange();
      };

      const readSessionDraft = () => {
        if (!isClient()) return null;
        try {
          const raw = window.sessionStorage.getItem(autosaveStorageKey.value);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };

      const writeSessionDraft = () => {
        if (!isClient()) return;
        try {
          window.sessionStorage.setItem(autosaveStorageKey.value, JSON.stringify({
            updatedAt: Date.now(),
            name: cassetteNameDraft.value || t('cassette.newCassette'),
            tree: cloneDesignerTree()
          }));
        } catch {
          // Session autosave is best-effort; explicit Save remains the reliable path.
        }
      };

      const clearSessionDraft = () => {
        if (!isClient()) return;
        window.sessionStorage.removeItem(autosaveStorageKey.value);
        sessionDraftAvailable.value = false;
      };

      const refreshSessionDraftState = () => {
        const draft = readSessionDraft();
        sessionDraftAvailable.value = Boolean(draft?.tree);
      };

      const recoverSessionDraft = () => {
        const draft = readSessionDraft();
        if (!draft?.tree) return;
        suppressHistory = true;
        suppressAutosave = true;
        cassetteNameDraft.value = draft.name || cassetteNameDraft.value;
        cassetteTree.value = draft.tree;
        selectedWorkpieceOverrideId.value = '';
        sessionDraftAvailable.value = false;
        resetDesignerHistory();
      };

      const discardSessionDraft = () => {
        clearSessionDraft();
      };

      const nextOnboardingStep = () => {
        onboardingIndex.value = Math.min(onboardingIndex.value + 1, onboardingSteps.value.length - 1);
      };

      const previousOnboardingStep = () => {
        onboardingIndex.value = Math.max(onboardingIndex.value - 1, 0);
      };

      const dismissOnboarding = () => {
        onboardingDismissed.value = true;
        if (!isClient()) return;
        window.localStorage.setItem(onboardingStorageKey, JSON.stringify({ dismissed: true, dismissedAt: Date.now() }));
      };

      const recordTitle = (record) => record?.name ?? record?.fields?.name ?? '';
      const templateName = (template) => (
        recordTitle(template) ||
        t('cassette.newCassette')
      );

      // A template's graph tree rides its payload document (§3): the
      // host's document transport resolves the payload URL — the module
      // never fetches.
      const templateTreeOf = async (template) => {
        const document = await props.persistence.loadDocument(template);
        const graphTree = document?.extensions?.perigram?.graphTree ||
          document?.graphTree ||
          null;
        if (!graphTree) return createCassetteV2GraphTree();
        try {
          return JSON.parse(JSON.stringify(graphTree));
        } catch {
          return createCassetteV2GraphTree();
        }
      };

      const applyTemplate = async (template) => {
        suppressAutosave = true;
        cassetteNameDraft.value = templateName(template);
        cassetteTree.value = await templateTreeOf(template);
        selectedNodeId.value = cassetteTree.value.rootId;
        selectedWorkpieceOverrideId.value = '';
        selectedRelationId.value = '';
        inspectorSelection.value = 'face';
        foldedPreviewWorkpieceId.value = '';
        previewError.value = '';
        loadedTemplateId.value = template?._id || '';
        resetDesignerHistory();
        refreshSessionDraftState();
      };

      // Loads a cassette record and its OCCS payload document as the
      // designer's template shape (record + `definition`).
      const hydrateDefinition = async (record) => {
        if (!record || record.definition) return record;
        const document = await props.persistence.loadDocument(record).catch(() => null);
        return document ? { ...record, definition: document } : record;
      };

      const loadTemplateInto = async (id) => {
        const key = id?.toString?.() || id;
        if (!key) return;
        const known = templateRecords.value.find(item => item._id?.toString() === key);
        const dto = known || await queries.get('cassette-template', key).catch(() => null);
        if (!dto) return;
        const hydrated = await hydrateDefinition(dto);
        persistedTemplateIdOverride.value = hydrated._id?.toString() || '';
        loadedDocument.value = hydrated;
        applyTemplate(hydrated);
      };

      // A blank tab has no record yet: its draft name rides the first save.
      const applyRename = async () => {
        const name = cassetteNameDraft.value.trim();
        closeDockPopover();
        const target = selectedTemplateId.value ? (props.record || blankCreatedTarget) : null;
        if (!name || !target || recordTitle(target) === name) return;
        try {
          await props.persistence.rename(target, name);
          if (loadedDocument.value) loadedDocument.value = { ...loadedDocument.value, name };
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || t('cassette.errors.saveFailed') });
        }
      };

      const saveTemplate = async ({ saveAs = false } = {}) => {
        const tree = JSON.parse(JSON.stringify(cassetteTree.value));
        const definition = await createCassetteV2OccsDocument(tree, cassetteMarkContext.value);
        const name = cassetteNameDraft.value || t('cassette.newCassette');
        try {
          // A blank editor tab has no record prop: the first save creates
          // the instance, and the created target binds for every later
          // save on the same tab.
          let target = !saveAs && selectedTemplateId.value ? (props.record || blankCreatedTarget) : null;
          if (!target || saveAs) {
            target = await props.persistence.createBlank();
          }
          blankCreatedTarget = target;
          await props.persistence.saveDocument(target, definition, {
            fileName: `${name}.occs`,
            mimeType: OCCS_MIME
          });
          if (recordTitle(target) !== name) {
            await props.persistence.rename(target, name);
          }
          // The record's declared geometry fields ride the same save: the
          // evaluated nesting polygons and layer rows are what sheet
          // layouts and nesting consume without loading the payload.
          try {
            const evaluation = await evaluateOccsCassetteTemplate(definition, tree.parameters || {}, {
              templateId: target._id?.toString() || '',
              templateName: name
            });
            await props.persistence.patch(target, {
              polygonParts: evaluation.nestingPolygons,
              layerData: evaluation.layerData
            });
          } catch (evaluationError) {
            notify({
              severity: 'warn',
              summary: t('common.error'),
              detail: evaluationError?.message || t('cassette.errors.saveFailed'),
              life: 6000
            });
          }
          persistedTemplateIdOverride.value = target._id?.toString() || persistedTemplateIdOverride.value;
          loadedDocument.value = { ...target, definition };
          applyTemplate(loadedDocument.value);
          notify({ severity: 'success', summary: t('common.success'), detail: t('common.save'), life: 2000 });
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || t('cassette.errors.saveFailed') });
          return;
        }
        if (isClient()) {
          window.sessionStorage.removeItem(autosaveStorageKey.value);
        }
        sessionDraftAvailable.value = false;
      };

      let previewToken = 0;
      let previewTimer = null;
      const PREVIEW_RENDER_DELAY_MS = 120;

      const renderPreview = async (treeSnapshot, optionsSnapshot = {}) => {
        const token = ++previewToken;
        const emptyDrawing = {
          viewBox: '0 0 100 100',
          layers: [],
          designerEdges: [],
          designerFaces: [],
          designerFoldEdges: [],
          designerSections: { handles: [], segments: [] },
          foldedPreview: { faces: [], folds: [] }
        };
        try {
          const [drawing, cassetteDrawing] = await Promise.all([
            renderCassetteV2TreeToDrawing(treeSnapshot, optionsSnapshot),
            renderCassetteV2TreeToDrawing(treeSnapshot, {
              mode: 'assembly',
              cassetteMarkContext: optionsSnapshot.cassetteMarkContext || {}
            })
          ]);
          if (token === previewToken) {
            previewSource.value = drawing || emptyDrawing;
            cassettePreviewSource.value = cassetteDrawing || emptyDrawing;
            previewError.value = '';
          }
        } catch (error) {
          if (token === previewToken) previewError.value = error?.message || String(error);
        }
      };

      const schedulePreviewRender = (delay = PREVIEW_RENDER_DELAY_MS) => {
        if (!isClient()) return;
        if (previewTimer) window.clearTimeout(previewTimer);
        const treeSnapshot = JSON.parse(JSON.stringify(cassetteTree.value));
        const optionsSnapshot = previewMode.value === 'assembly'
          ? {
              mode: 'assembly',
              contextWorkpieceId: selectedWorkpieceId.value,
              selectedRelationId: selectedRelationId.value,
              cassetteMarkContext: cassetteMarkContext.value
            }
          : {
              mode: 'workpiece',
              workpieceId: previewWorkpieceId.value,
              cassetteMarkContext: cassetteMarkContext.value
            };
        previewTimer = window.setTimeout(() => {
          previewTimer = null;
          renderPreview(treeSnapshot, optionsSnapshot);
        }, delay);
      };

      watch([cassetteTree, previewMode, previewWorkpieceId, selectedWorkpieceId, selectedRelationId, cassetteNameDraft, selectedTemplateId], () => schedulePreviewRender(), { immediate: true });
      watch([cassetteTree, cassetteNameDraft], () => {
        if (suppressHistory) {
          suppressHistory = false;
          designerHistory.sync();
          return;
        }
        designerHistory.commit();
      }, { deep: true });
      watch([cassetteTree, cassetteNameDraft, autosaveStorageKey], () => {
        if (!isClient()) return;
        if (suppressAutosave) {
          suppressAutosave = false;
          return;
        }
        if (autosaveTimer) window.clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(() => {
          autosaveTimer = null;
          writeSessionDraft();
        }, 900);
      }, { deep: true });
      watch(autosaveStorageKey, () => {
        refreshSessionDraftState();
      });

      // The opened record: its payload document loads before the tree
      // applies; payload-less records keep the blank tree. The template
      // list for the open dock rides the query transport and refetches
      // every time the picker opens (saves bake new previews into
      // fields the list DTOs carry).
      const loadTemplateRecords = () => {
        queries.list('cassette-template').then(rows => {
          templateRecords.value = rows || [];
          hydrateTemplateThumbnails();
        }).catch(() => {});
      };
      watch(() => props.record?._id || '', async (recordId) => {
        persistedTemplateIdOverride.value = '';
        if (!recordId) {
          applyTemplate(null);
          return;
        }
        if (recordId === loadedTemplateId.value) return;
        const hydrated = await hydrateDefinition(props.record);
        loadedDocument.value = hydrated;
        applyTemplate(hydrated);
      }, { immediate: true });

      // A chip's draft dies with the workpiece selection that owns it.
      watch([selectedWorkpieceId, workpieceRelations], () => {
        const selectedIncoming = selectedWorkpieceRelations.value.find(relation => relation.driver) ||
          selectedWorkpieceRelations.value[0] ||
          null;
        const stillExists = workpieceRelations.value.some(relation => relation.id === selectedRelationId.value);
        if (selectedIncoming && (!selectedRelationId.value || !stillExists)) {
          selectedRelationId.value = selectedIncoming.id;
        } else if (!stillExists) {
          selectedRelationId.value = selectedIncoming?.id || '';
        }
      }, { immediate: true });

      onMounted(() => {
        if (!isClient()) return;
        window.addEventListener('keydown', handleDesignerKeydown, true);
        try {
          const onboardingState = window.localStorage.getItem(onboardingStorageKey);
          onboardingDismissed.value = Boolean(onboardingState && JSON.parse(onboardingState)?.dismissed);
        } catch {
          onboardingDismissed.value = false;
        }
        refreshSessionDraftState();
        resetDesignerHistory();
        loadTemplateRecords();
      });

      onBeforeUnmount(() => {
        previewToken += 1;
        if (previewTimer && isClient()) window.clearTimeout(previewTimer);
        if (autosaveTimer && isClient()) window.clearTimeout(autosaveTimer);
        if (!isClient()) return;
        window.removeEventListener('keydown', handleDesignerKeydown, true);
        window.document.removeEventListener('mousemove', handleInlineEditorDragMove);
        window.document.removeEventListener('mouseup', stopInlineEditorDrag);
      });

      const updateFaceParameter = (nodeId, key, value) => {
        cassetteTree.value = updateCassetteV2GraphNode(cassetteTree.value, nodeId, { [key]: value });
      };

      const sanitizeAngleInput = (value) => String(value ?? '').replace(/\s*deg\s*$/i, '').trim();

      const updateFoldAngle = (nodeId, value) => {
        const nextValue = sanitizeAngleInput(value);
        cassetteTree.value = {
          ...cassetteTree.value,
          nodes: treeNodes.value.map(node => (
            node.id === nodeId
              ? { ...node, foldAngle: nextValue }
              : node
          ))
        };
      };

      const expressionParametersForGlobal = (key) => {
        const nextParameters = { ...globalParameters.value };
        delete nextParameters[key];
        return nextParameters;
      };

      const expressionParameterNamesForGlobal = (key) => globalParameterNames.value.filter(name => name !== key);

      const updateGlobalParameter = (key, value) => {
        cassetteTree.value = {
          ...cassetteTree.value,
          parameters: {
            ...globalParameters.value,
            [key]: value
          }
        };
      };

      const nextGlobalParameterName = () => {
        const used = new Set(Object.keys(globalParameters.value));
        for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
          const key = String.fromCharCode(code);
          if (!used.has(key)) return key;
        }
        let index = 1;
        while (used.has(`P${index}`)) index += 1;
        return `P${index}`;
      };

      const addGlobalParameter = () => {
        updateGlobalParameter(nextGlobalParameterName(), '0');
      };

      // Renaming refactors every reference in the tree (node parameters,
      // instance values, profile sketches, joint placements); invalid or
      // colliding names refuse — the row re-renders with the old name.
      const renameGlobalParameter = (from, to) => {
        cassetteTree.value = renameCassetteV2TreeParameter(cassetteTree.value, from, to);
      };

      const deleteGlobalParameter = (key) => {
        const nextParameters = { ...globalParameters.value };
        delete nextParameters[key];
        cassetteTree.value = {
          ...cassetteTree.value,
          parameters: nextParameters
        };
      };

      const syncVisibleLayersForDrawing = (layers = []) => {
        drawingLayers.value = layers;
        const hidden = new Set(hiddenLayerNames.value);
        visibleLayerNames.value = drawingLayerNames.value.filter(name => !hidden.has(name));
      };

      const updateHiddenLayers = (visibleNames) => {
        const visible = new Set(visibleNames);
        const hidden = new Set(hiddenLayerNames.value);
        drawingLayerNames.value.forEach((name) => {
          if (visible.has(name)) hidden.delete(name);
          else hidden.add(name);
        });
        hiddenLayerNames.value = [...hidden];
      };

      const updateVisibleLayerNames = (layers) => {
        const nextLayers = Array.isArray(layers) ? layers.filter(Boolean) : [];
        visibleLayerNames.value = nextLayers;
        updateHiddenLayers(nextLayers);
      };

      const defaultFaceRole = (node) => node?.role || (node?.parentId ? 'return_flange' : 'main');

      const updateFaceRole = (nodeId, role) => {
        if (!OCCS_CASSETTE_FACE_ROLES.includes(role)) return;
        cassetteTree.value = {
          ...cassetteTree.value,
          nodes: treeNodes.value.map(item => (
            item.id === nodeId ? { ...item, role } : item
          ))
        };
      };

      const editorPointFromScreen = ({ x = 0, y = 0, type = '' } = {}) => {
        const bounds = editorSurfaceRef.value?.getBoundingClientRect?.();
        if (!bounds) return { x: 12, y: 12 };
        const width = type === 'attachment' ? 400 : 272;
        const height = type === 'attachment'
          ? 360
          : type === 'faceActions' ? 160 : 116;
        return {
          x: Math.min(Math.max(x - bounds.left + 8, 8), Math.max(bounds.width - width - 8, 8)),
          y: Math.min(Math.max(y - bounds.top + 8, 8), Math.max(bounds.height - height - 8, 8))
        };
      };

      const storedInlineEditorPoint = () => {
        if (!isClient()) return null;
        try {
          const point = JSON.parse(window.sessionStorage.getItem(inlineEditorPositionKey) || 'null');
          if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
          return point;
        } catch {
          return null;
        }
      };

      const persistInlineEditorPoint = (point) => {
        if (!isClient()) return;
        window.sessionStorage.setItem(inlineEditorPositionKey, JSON.stringify({
          x: Math.max(8, Math.round(point.x)),
          y: Math.max(8, Math.round(point.y))
        }));
      };

      const closeInlineEditor = () => {
        attachmentDraft.clear();
        inlineEditor.value = null;
      };

      const openInlineEditor = (editor) => {
        const storedPoint = storedInlineEditorPoint();
        inlineEditor.value = {
          ...editor,
          ...(storedPoint || editorPointFromScreen(editor))
        };
      };

      const handleInlineEditorDragMove = (event) => {
        if (!inlineEditorDrag.value || !inlineEditor.value) return;
        const bounds = editorSurfaceRef.value?.getBoundingClientRect?.();
        if (!bounds) return;
        const width = inlineEditorDrag.value.width || 272;
        const height = inlineEditorDrag.value.height || 116;
        const next = {
          x: Math.min(Math.max(event.clientX - bounds.left - inlineEditorDrag.value.dx, 8), Math.max(bounds.width - width - 8, 8)),
          y: Math.min(Math.max(event.clientY - bounds.top - inlineEditorDrag.value.dy, 8), Math.max(bounds.height - height - 8, 8))
        };
        inlineEditor.value = { ...inlineEditor.value, ...next };
        persistInlineEditorPoint(next);
      };

      const stopInlineEditorDrag = () => {
        inlineEditorDrag.value = null;
        if (!isClient()) return;
        window.document.removeEventListener('mousemove', handleInlineEditorDragMove);
      };

      const startInlineEditorDrag = (event) => {
        if (!inlineEditor.value || !isClient()) return;
        const target = event.currentTarget?.parentElement;
        const rect = target?.getBoundingClientRect?.();
        if (!rect) return;
        inlineEditorDrag.value = {
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          width: rect.width,
          height: rect.height
        };
        window.document.addEventListener('mousemove', handleInlineEditorDragMove);
        window.document.addEventListener('mouseup', stopInlineEditorDrag, { once: true });
      };

      const updateInlineEditorValue = (value) => {
        if (!inlineEditor.value) return;
        if (inlineEditor.value.type === 'foldAngle') {
          const nextValue = sanitizeAngleInput(value);
          inlineEditor.value = { ...inlineEditor.value, value: nextValue };
          updateFoldAngle(inlineEditor.value.nodeId, nextValue);
          return;
        }
        inlineEditor.value = { ...inlineEditor.value, value };
        updateFaceParameter(inlineEditor.value.nodeId, inlineEditor.value.key, value);
      };

      const layerInputId = (row) => `cassette-v2-layer-${String(row.key).replace(/[^A-Za-z0-9_-]/g, '-')}`;

      const handleDrawingReady = async (drawing) => {
        const layers = Array.isArray(drawing?.layers) ? drawing.layers : [];
        syncVisibleLayersForDrawing(layers);
        if (layers.some(layer => layer.standardCode || layer.standardId || layer.penId)) {
          await loadLayerStores();
        }
      };

      const resetTree = () => {
        suppressAutosave = true;
        cassetteTree.value = createCassetteV2GraphTree();
        selectedNodeId.value = cassetteTree.value.rootId;
        selectedWorkpieceOverrideId.value = '';
        selectedRelationId.value = '';
        inspectorSelection.value = 'face';
        previewError.value = '';
        clearSessionDraft();
        resetDesignerHistory();
      };

      const selectWorkpiece = (workpieceId) => {
        const workpiece = workpieces.value.find(item => item.id === workpieceId);
        if (!workpiece) return;
        selectedWorkpieceOverrideId.value = workpiece.id;
        if (workpiece.rootId) selectedNodeId.value = workpiece.rootId;
      };

      const selectWorkpieceForInspector = (workpieceId) => {
        closeInlineEditor();
        selectWorkpiece(workpieceId);
        inspectorSelection.value = 'workpiece';
      };

      const selectProfileWorkpiece = (workpieceId) => {
        const relation = workpieceRelations.value.find(item => item.sourceWorkpieceId === workpieceId);
        if (relation) {
          selectWorkpieceRelation(relation.id);
          return;
        }
        selectWorkpieceForInspector(workpieceId);
      };

      const selectWorkpieceRelation = (relationId, event = null) => {
        closeInlineEditor();
        const relation = workpieceRelations.value.find(item => item.id === relationId);
        selectedRelationId.value = relationId;
        if (relation?.sourceWorkpieceId) selectWorkpiece(relation.sourceWorkpieceId);
        inspectorSelection.value = 'attachment';
        // The inline editor positions relative to the canvas container:
        // screen coords from panel clicks convert (and clamp) through
        // the same mapper the canvas path uses.
        const point = event
          ? editorPointFromScreen({ x: event.clientX, y: event.clientY, type: 'attachment' })
          : { x: 120, y: 120 };
        openInlineEditor({
          type: 'attachment',
          relationId,
          ...point
        });
      };

      const updateSelectedWorkpieceRelation = (patch) => {
        if (!selectedWorkpieceRelation.value) return;
        cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, selectedWorkpieceRelation.value.id, patch);
      };

      const updateInlineAttachmentRelation = (patch) => {
        const relationId = inlineEditorRelation.value?.id || selectedWorkpieceRelation.value?.id;
        if (!relationId) return;
        const relation = getCassetteV2WorkpieceRelations(cassetteTree.value)
          .find(item => item.id === relationId);
        if (!relation) return;
        const nextPatch = { ...patch };
        // A patch that lands in edge-array placement must sit on an
        // arrangeable edge: a stale default ('E0') on a face whose E0 is
        // a fold snaps to the first arrangeable edge — folds and
        // profile-arranged edges are prohibited (owner law 2026-10-16).
        if ((nextPatch.placementMode || relation.placementMode) === 'edgeArray') {
          const attachable = cassetteV2AttachableProfileEdgesForTree(
            cassetteTree.value,
            nextPatch.targetFaceId || relation.targetFaceId,
            { edgeCountByFaceId: faceEdgeCounts.value }
          );
          const edge = nextPatch.arrayEdge ?? relation.arrayEdge;
          if (attachable.length && !attachable.includes(edge)) nextPatch.arrayEdge = attachable[0];
        }
        cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, relationId, nextPatch);
      };

      const deleteWorkpieceRelation = (relationId) => {
        if (!relationId) return;
        const result = deleteCassetteV2WorkpieceRelation(cassetteTree.value, relationId);
        if (!result.deletedRelationId) return;
        closeInlineEditor();
        cassetteTree.value = result.tree;
        selectedRelationId.value = result.selectedRelationId;
        if (result.selectedWorkpieceId) selectWorkpieceForInspector(result.selectedWorkpieceId);
        else inspectorSelection.value = 'workpiece';
      };

      const addWorkpieceFrom = (workpieceId) => {
        closeInlineEditor();
        const referenceNode = selectedNode.value?.workpieceId === workpieceId
          ? selectedNode.value
          : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId);
        const result = addCassetteV2Workpiece(cassetteTree.value, {
          referenceWorkpieceId: workpieceId,
          referenceNodeId: referenceNode?.id
        });
        cassetteTree.value = result.tree;
        selectedNodeId.value = result.nodeId;
        selectedWorkpieceOverrideId.value = '';
        selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
          .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
        inspectorSelection.value = 'workpiece';
      };

      // Hardware lands on the selected workpiece (or a selected hardware
      // row's host): the reference resolution is shared by the library
      // pick and the dialog's Save.
      const hardwareReference = () => {
        const selectedIsHardware = Boolean(selectedWorkpiece.value?.family || selectedWorkpiece.value?.hardware?.family);
        const parentRelation = selectedIsHardware
          ? workpieceRelations.value.find(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value)
          : null;
        const referenceWorkpieceId = parentRelation?.targetWorkpieceId || selectedWorkpieceId.value || workpieces.value[0]?.id;
        const referenceNodeId = selectedNode.value?.workpieceId === referenceWorkpieceId
          ? selectedNode.value.id
          : treeNodes.value.find(node => node.workpieceId === referenceWorkpieceId && !node.parentId)?.id;
        return { referenceWorkpieceId, referenceNodeId };
      };

      const placeHardwareWorkpiece = ({ name = '', family = 'hanger_clip', productionMode = 'integralCut', parameters = {} } = {}) => {
        closeInlineEditor();
        const result = addCassetteV2HardwareWorkpiece(cassetteTree.value, {
          ...hardwareReference(),
          ...(name ? { name } : {}),
          family,
          productionMode,
          parameters
        });
        cassetteTree.value = result.tree;
        selectedWorkpieceOverrideId.value = result.workpieceId;
        selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
          .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
        inspectorSelection.value = 'attachment';
      };

      // The hardware library: `hardware` records of the plugin's own
      // type, same workflow as profiles. Hardware is a catalog domain
      // (occs/hardware.js owns families, defaults, modes) — the create
      // flow is a parameter form over the catalog, never a canvas.
      const loadHardwareLibrary = async () => {
        try {
          const items = await queries.list('hardware');
          hardwareLibraryRecords.value = Array.isArray(items) ? items : [];
          hardwareLibraryAvailable.value = true;
        } catch {
          hardwareLibraryAvailable.value = false;
          hardwareLibraryRecords.value = [];
        }
      };

      const openHardwarePicker = (event) => {
        loadHardwareLibrary();
        hardwarePicker.value?.toggle?.(event);
      };

      const closeHardwarePicker = () => {
        hardwarePicker.value?.hide?.();
      };

      const openHardwareDialog = () => {
        hardwareDraft.value = createHardwareDraft();
        hardwareDialogVisible.value = true;
      };

      const onHardwareDraftFamilyChange = (family) => {
        hardwareDraft.value = createHardwareDraft(family);
      };

      const hardwareDraftParameterKeys = computed(() => Object.keys(hardwareDefaultParameters(hardwareDraft.value.family)));

      const addHardwareFromLibrary = (record) => {
        if (!record) return;
        placeHardwareWorkpiece({
          name: record.name || hardwareLabel(record?.fields?.family || 'bolt', record?.fields?.productionMode || ''),
          family: record?.fields?.family || 'bolt',
          productionMode: record?.fields?.productionMode || 'integralCut',
          parameters: { ...(record?.fields?.parameters || {}) }
        });
        closeHardwarePicker();
      };

      const saveHardwareDraft = () => {
        placeHardwareWorkpiece({
          name: hardwareDraft.value.name || hardwareLabel(hardwareDraft.value.family, hardwareDraft.value.productionMode),
          family: hardwareDraft.value.family,
          productionMode: hardwareDraft.value.productionMode,
          parameters: { ...(hardwareDraft.value.parameters || {}) }
        });
        hardwareDialogVisible.value = false;
      };

      const saveHardwareDraftToLibrary = async () => {
        try {
          const created = await records.create('hardware', {
            name: hardwareDraft.value.name || hardwareLabel(hardwareDraft.value.family, hardwareDraft.value.productionMode),
            fields: {
              family: hardwareDraft.value.family,
              productionMode: hardwareDraft.value.productionMode,
              parameters: { ...(hardwareDraft.value.parameters || {}) }
            }
          });
          if (created) hardwareLibraryRecords.value = [created, ...hardwareLibraryRecords.value];
          hardwareLibraryAvailable.value = true;
          notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.hardwareLibrary.savedToLibrary'), life: 2500 });
        } catch (error) {
          if (error?.name === 'OfflineQueuedError') {
            notify({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
            return;
          }
          notify({
            severity: 'error',
            summary: t('common.error'),
            detail: error?.data?.message || error?.message || t('cassette.v2.hardwareLibrary.saveFailed'),
            life: 4000
          });
        }
      };

      const profileDraftPayload = () => {
        const sketch = preparedProfileDraftSketch.value;
        return {
          name: profileDraft.value.name || t('cassette.v2.profileEditor.defaultName'),
          kind: profileDraft.value.kind,
          process: profileDraft.value.process,
          sketch,
          // The cached section reads the authored evaluation the save gate
          // inspected; the placement re-evaluates its own overrides.
          occsProfile: profileDraftInspection.value.evaluated
            ? buildOccsProfileFromEvaluatedSketch(profileDraftInspection.value.evaluated)
            : null
        };
      };

      // The assembly selection and its floating editor return untouched
      // when the sketch mode closes.
      const captureSketchReturn = () => ({
        selectedNodeId: selectedNodeId.value,
        selectedWorkpieceOverrideId: selectedWorkpieceOverrideId.value,
        selectedRelationId: selectedRelationId.value,
        inspectorSelection: inspectorSelection.value,
        inlineEditor: inlineEditor.value ? { ...inlineEditor.value } : null
      });

      const restoreSketchReturn = (state) => {
        if (!state) return;
        selectedNodeId.value = state.selectedNodeId;
        selectedWorkpieceOverrideId.value = state.selectedWorkpieceOverrideId;
        selectedRelationId.value = state.selectedRelationId;
        inspectorSelection.value = state.inspectorSelection;
        if (state.inlineEditor) openInlineEditor(state.inlineEditor);
      };

      // One session spans the assembly canvas and the sketch editor: it
      // holds the assembly camera and selection a flip returns to, and the
      // sketch camera each target reopens with.
      const openSketchSession = (mode, id, returnState) => {
        beginCanvasSession(canvasSession, {
          mode,
          id,
          returnState,
          assemblyView: drawingCanvasRef.value?.getViewBox() || null
        });
        sketchInitialView.value = canvasSketchView(canvasSession, canvasSession.target.key);
        sketchSessionKey.value += 1;
      };

      const closeSketchSession = ({ restoreSelection = true } = {}) => {
        rememberCanvasSketchView(canvasSession, sketchEditorRef.value?.snapshotView());
        const { returnState, assemblyView } = endCanvasSession(canvasSession);
        if (assemblyView) drawingCanvasRef.value?.setViewBox(assemblyView);
        if (restoreSelection) restoreSketchReturn(returnState);
      };

      // The assembly around the edited target, transformed into the
      // sketch's own frame and drawn locked under the authored sketch.
      const loadSketchContext = async (mode, id) => {
        const token = ++sketchContextToken;
        sketchContextEntities.value = [];
        if (!id) return;
        try {
          const entities = await cassetteV2SketchContext(cassetteTree.value, { mode, id });
          if (token === sketchContextToken) sketchContextEntities.value = entities || [];
        } catch {
          if (token === sketchContextToken) sketchContextEntities.value = [];
        }
      };

      const finishProfileSketch = (addedWorkpieceId = '') => {
        profileSketchOpen.value = false;
        closeSketchSession({ restoreSelection: !addedWorkpieceId });
        if (addedWorkpieceId) selectProfileWorkpiece(addedWorkpieceId);
      };

      const cancelProfileSketch = () => {
        profileSketchOpen.value = false;
        closeSketchSession();
      };

      const finishFaceSketch = () => {
        faceSketchOpen.value = false;
        closeSketchSession();
      };

      const cancelFaceSketch = () => {
        faceSketchOpen.value = false;
        closeSketchSession();
      };

      const openProfileSketch = (workpieceId = '') => {
        openSketchSession('profile', workpieceId, captureSketchReturn());
        loadSketchContext('profile', workpieceId);
        closeInlineEditor();
        profileEditorError.value = '';
        editingProfileWorkpieceId.value = workpieceId;
        const workpiece = workpieces.value.find(item => item.id === workpieceId) || null;
        if (workpiece) {
          const profile = workpiece.profileSnapshot || workpiece.profile || null;
          const snapshotSketch = profile?.sketch || createEmptyOccsProfileSketch();
          // The cassette's globals are read through shape expressions;
          // their stale copies in the profile's tables drop here, so the
          // rows the editor edits are the profile's own.
          const scope = globalParameters.value;
          const normalizedProfile = normalizeCassetteV2Profile(workpiece, scope);
          profileDraft.value = {
            name: workpiece.name || t('cassette.v2.profileEditor.defaultName'),
            kind: workpiece.role || profile?.kind || 'hanger',
            process: workpiece.process || profile?.process || 'extruded',
            // Placement overrides stay on the workpiece; the sketch mode
            // never evaluates or edits them.
            preservedInstance: { ...(normalizedProfile.instance || {}) },
            // The sketch mode edits the authored table alone.
            sketch: {
              ...snapshotSketch,
              parameters: pruneScopeBoundParameters(snapshotSketch.parameters, snapshotSketch.shapes, scope)
            },
            libraryId: workpiece.profileTemplateId?.toString() || ''
          };
        } else {
          // Blank draft (owner decision 2026-10-17): the sketch mode opens
          // on an empty canvas and an empty table, never the seeded template.
          profileDraft.value = {
            name: t('cassette.v2.profileEditor.defaultName'),
            kind: 'hanger',
            process: 'extruded',
            preservedInstance: {},
            sketch: createEmptyOccsProfileSketch(),
            libraryId: ''
          };
        }
        sketchEditorMounted.value = true;
        sketchEditorMode.value = 'profile';
        profileSketchOpen.value = true;
        loadProfileLibrary();
      };

      const resolvedFaceWidth = (node) => {
        if (!node) return '';
        if (node.parameters?.defaultLength !== 'inherit') return node.parameters?.defaultLength ?? '';
        if (!node.parentId) return '';
        const length = edgeLengthFor(node.parentId, `E${Math.max(0, Math.round(Number(node.parentEdgeIndex) || 0))}`);
        if (!Number.isFinite(length)) return '';
        const start = resolveCassetteV2Expression(node.parameters?.edgeStart, globalParameters.value, 0);
        return String(Math.round(Math.max(0, length - start) * 1000) / 1000);
      };

      // A face sketch is edited on the same shape canvas as a profile;
      // converting a trapezoid seeds the draft with its current outline.
      const openFaceShapeSketch = async (nodeId) => {
        openSketchSession('face', nodeId, captureSketchReturn());
        loadSketchContext('face', nodeId);
        closeInlineEditor();
        faceShapeEditorError.value = '';
        editingFaceNodeId.value = nodeId;
        try {
          const context = await cassetteV2FaceSketchContext(cassetteTree.value, nodeId);
          faceShapeDraft.value = context.sketch;
          faceShapeBasisStart.value = context.basisStart;
          faceShapeBasisEnd.value = context.basisEnd;
          faceShapeParentFace.value = context.parentFace || [];
        } catch (error) {
          faceShapeEditorError.value = error?.message || String(error);
          faceShapeDraft.value = createEmptyOccsProfileSketch();
          faceShapeBasisStart.value = null;
          faceShapeBasisEnd.value = null;
          faceShapeParentFace.value = [];
        }
        sketchEditorMounted.value = true;
        sketchEditorMode.value = 'face';
        faceSketchOpen.value = true;
      };

      const saveFaceShapeDraft = async () => {
        const sketch = closeOccsProfileSketchBoundary(faceShapeDraftSketch.value);
        try {
          await resolveCassetteV2FaceSketchRegion(sketch, globalParameters.value);
        } catch (error) {
          faceShapeEditorError.value = error?.message || String(error);
          return;
        }
        cassetteTree.value = updateCassetteV2FaceSketch(cassetteTree.value, editingFaceNodeId.value, sketch);
        finishFaceSketch();
      };

      const useTrapezoidFace = (nodeId = editingFaceNodeId.value) => {
        cassetteTree.value = updateCassetteV2FaceSketch(cassetteTree.value, nodeId, null);
        finishFaceSketch();
      };

      // The profile library: `profile` records of the plugin's own type,
      // authored only from the profile sketch mode. Save to library writes
      // the authored truth (kind, process, prepared sketch) through the
      // records host capability; picking one copies it into the draft —
      // a snapshot copy, never a live reference, so the cassette
      // document stays self-contained.
      const loadProfileLibrary = async () => {
        try {
          const items = await queries.list('profile');
          profileLibraryRecords.value = Array.isArray(items) ? items : [];
          profileLibraryAvailable.value = true;
        } catch {
          // The org's install does not declare the type yet (upgrade
          // pending): the library affordances stay hidden instead of
          // failing on every use.
          profileLibraryAvailable.value = false;
          profileLibraryRecords.value = [];
        }
      };

      const applyProfileLibraryRecord = (record) => {
        if (!record) return;
        closeProfileDeletePopover();
        const sketch = normalizeOccsProfileSketch(
          record?.fields?.sketch || createEmptyOccsProfileSketch(),
          {}
        );
        profileDraft.value = {
          name: record.name || t('cassette.v2.profileEditor.defaultName'),
          kind: record?.fields?.kind || 'hanger',
          process: record?.fields?.process || 'extruded',
          preservedInstance: { ...(profileDraft.value.preservedInstance || {}) },
          sketch,
          libraryId: record?._id?.toString() || ''
        };
      };

      // The add-profile picker: library rows with evaluated-sketch
      // thumbnails beside Create new (the blank sketch draft). Picking a
      // row places the profile as a workpiece directly — a snapshot copy
      // of the record's authored truth; the sketch mode stays the
      // authoring surface.
      const openProfilePicker = (event) => {
        loadProfileLibrary();
        profilePicker.value?.toggle?.(event);
      };

      const closeProfilePicker = () => {
        profilePicker.value?.hide?.();
      };

      const openProfileDeletePopover = (event) => {
        profileDeletePopover.value?.toggle?.(event);
      };

      const closeProfileDeletePopover = () => {
        profileDeletePopover.value?.hide?.();
      };

      watch(profileSketchOpen, visible => {
        if (!visible) closeProfileDeletePopover();
      });

      // Thumbnails resolve asynchronously (the boolean section folds
      // through the Clipper runtime); the picker renders from the map
      // as each record's drawing lands.
      const profileThumbnails = ref({});
      const resolveProfileThumbnails = async () => {
        for (const record of profileLibraryRecords.value) {
          const id = record?._id?.toString();
          if (!id || profileThumbnails.value[id]) continue;
          const layerData = await resolveOccsProfileSketchLayerData(record?.fields?.sketch);
          profileThumbnails.value = { ...profileThumbnails.value, [id]: layerData ? normalizeGeometryDrawing({ data: { layerData } }) : null };
        }
      };
      watch(profileLibraryRecords, () => { resolveProfileThumbnails(); });

      const profileTargetFaceId = () => {
        if (selectedNode.value?.workpieceId === selectedWorkpieceId.value) return selectedNode.value.id;
        return workpieces.value.find(workpiece => workpiece.id === selectedWorkpieceId.value)?.rootId || '';
      };

      const addProfileFromLibrary = (record) => {
        if (!record) return;
        const sketch = normalizeOccsProfileSketch(
          record?.fields?.sketch || createEmptyOccsProfileSketch(),
          {}
        );
        // An authored-but-empty snapshot never places template geometry
        // (the default hanger stands in for sketch-less workpieces only).
        if (!isOccsProfileSketchSavable(sketch)) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        let occsProfile = null;
        try {
          occsProfile = occsProfileFromSketch(sketch, {});
        } catch {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        const targetFaceId = profileTargetFaceId();
        const added = addCassetteV2ProfileWorkpiece(cassetteTree.value, {
          referenceWorkpieceId: selectedWorkpieceId.value,
          referenceNodeId: targetFaceId,
          name: record.name || t('cassette.v2.profileEditor.defaultName'),
          kind: record?.fields?.kind || 'hanger',
          process: record?.fields?.process || 'extruded',
          instance: {},
          occsProfile,
          sketch,
          // Library provenance: edits stay local (the snapshot law), and
          // Update library targets this record.
          profileTemplateId: record?._id?.toString() || ''
        });
        cassetteTree.value = added.tree;
        closeProfilePicker();
        selectWorkpiece(added.workpieceId);
      };

      const saveProfileDraftToLibrary = async ({ asNew = false } = {}) => {
        if (!profileDraftAuthoredReady.value) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        const payload = profileDraftPayload();
        try {
          const created = await records.create('profile', {
            name: payload.name,
            fields: {
              kind: payload.kind,
              process: payload.process,
              sketch: payload.sketch
            }
          });
          if (created) {
            profileLibraryRecords.value = [created, ...profileLibraryRecords.value];
            const createdId = created?._id?.toString();
            if (asNew && createdId) profileDraft.value.libraryId = createdId;
          }
          closeProfileDeletePopover();
          notify({
            severity: 'success',
            summary: t('common.success'),
            detail: t(asNew ? 'cassette.v2.profileEditor.savedAsToLibrary' : 'cassette.v2.profileEditor.savedToLibrary'),
            life: 2500
          });
        } catch (error) {
          if (error?.name === 'OfflineQueuedError') {
            notify({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
            return;
          }
          notify({
            severity: 'error',
            summary: t('common.error'),
            detail: error?.data?.message || error?.message || t('cassette.v2.profileEditor.librarySaveFailed'),
            life: 4000
          });
        }
      };

      // Editing a library-sourced profile is local (the snapshot law);
      // Save to library overwrites the origin record. Save as creates a
      // new record and makes it the draft's origin; Delete removes the
      // origin. Already-placed workpieces keep their snapshots.
      const updateProfileLibraryRecord = async () => {
        const libraryId = profileDraft.value.libraryId;
        if (!profileDraftAuthoredReady.value || !libraryId) {
          if (!profileDraftAuthoredReady.value) {
            notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          }
          return;
        }
        const payload = profileDraftPayload();
        try {
          const updated = await records.update('profile', libraryId, {
            name: payload.name,
            fields: {
              kind: payload.kind,
              process: payload.process,
              sketch: payload.sketch
            }
          });
          if (updated) {
            profileLibraryRecords.value = profileLibraryRecords.value.map(item =>
              item?._id?.toString() === libraryId ? updated : item);
            const thumbnails = { ...profileThumbnails.value };
            delete thumbnails[libraryId];
            profileThumbnails.value = thumbnails;
          }
          notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.updatedInLibrary'), life: 2500 });
        } catch (error) {
          if (error?.name === 'OfflineQueuedError') {
            notify({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
            return;
          }
          notify({
            severity: 'error',
            summary: t('common.error'),
            detail: error?.data?.message || error?.message || t('cassette.v2.profileEditor.librarySaveFailed'),
            life: 4000
          });
        }
      };

      const deleteProfileLibraryRecord = async () => {
        const libraryId = profileDraft.value.libraryId;
        if (!libraryId) return;
        try {
          await records.delete('profile', libraryId);
          profileLibraryRecords.value = profileLibraryRecords.value.filter(
            item => item?._id?.toString() !== libraryId
          );
          const thumbnails = { ...profileThumbnails.value };
          delete thumbnails[libraryId];
          profileThumbnails.value = thumbnails;
          profileDraft.value.libraryId = '';
          closeProfileDeletePopover();
          notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.deletedFromLibrary'), life: 2500 });
        } catch (error) {
          if (error?.name === 'OfflineQueuedError') {
            notify({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
            return;
          }
          notify({
            severity: 'error',
            summary: t('common.error'),
            detail: error?.data?.message || error?.message || t('cassette.v2.profileEditor.libraryDeleteFailed'),
            life: 4000
          });
        }
      };

      // Profiles persist as tree workpieces (the workpiece's
      // profileSnapshot is the renderer's geometry source) and ride the
      // cassette template's own save.
      const saveProfileDraft = () => {
        if (!profileDraftReady.value) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        const payload = profileDraftPayload();
        const preservedInstance = { ...(profileDraft.value.preservedInstance || {}) };
        const workpieceId = editingProfileWorkpieceId.value;
        let addedWorkpieceId = '';
        if (workpieceId && workpieces.value.some(item => item.id === workpieceId)) {
          cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, workpieceId, {
            name: payload.name,
            role: payload.kind,
            process: payload.process,
            instance: preservedInstance,
            profileTemplateId: profileDraft.value.libraryId || '',
            profileSnapshot: {
              kind: payload.kind,
              process: payload.process,
              instance: preservedInstance,
              sketch: payload.sketch,
              section: payload.occsProfile.section,
              sweep: payload.occsProfile.sweep
            }
          });
        } else {
          const targetFaceId = profileTargetFaceId();
          const added = addCassetteV2ProfileWorkpiece(cassetteTree.value, {
            referenceWorkpieceId: selectedWorkpieceId.value,
            referenceNodeId: targetFaceId,
            name: payload.name,
            kind: payload.kind,
            process: payload.process,
            instance: {},
            occsProfile: payload.occsProfile,
            sketch: payload.sketch,
            profileTemplateId: profileDraft.value.libraryId || ''
          });
          cassetteTree.value = added.tree;
          selectWorkpiece(added.workpieceId);
          addedWorkpieceId = added.workpieceId;
        }
        finishProfileSketch(addedWorkpieceId);
        notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.saved'), life: 2500 });
      };

      const updateSelectedHardware = (patch) => {
        if (!selectedWorkpiece.value) return;
        cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, selectedWorkpiece.value.id, patch);
      };

      // Instance values re-evaluate the profile snapshot from its
      // authored sketch — this is parametric instantiation on the
      // workpiece row, and it writes the instance table alone.
      const updateProfileWorkpieceParameter = (workpieceId, key, value) => {
        const workpiece = workpieces.value.find(item => item.id === workpieceId);
        if (!workpiece) return;
        cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, workpieceId, {
          instance: { ...(workpiece.profileSnapshot?.instance || {}), [key]: value }
        });
      };

      // A parameter field is the shared expression editor over the
      // cassette's variables and the profile's own rows (the same
      // component every expression field rides): its value may name
      // either and reads it live.
      const profileParameterField = (row, key, value, inputId = '') => {
        const profileTable = { ...(row.authoredParameters || {}), ...(row.instanceParameters || {}) };
        const parameters = { ...globalParameters.value, ...profileTable };
        const error = expressionErrorOf(value, parameters, t('cassette.v2.expression.empty'));
        const derived = row.parameters?.[key];
        const draftKey = `profile-param:${row.id}:${key}`;
        return h(InputText, {
          id: inputId,
          fluid: true,
          modelValue: attachmentDraft.text(draftKey, value),
          ...attachmentDraft.handlers(draftKey, value, next => {
            updateProfileWorkpieceParameter(row.id, key, next);
          }),
          invalid: Boolean(error),
          title: error || (derived === undefined ? key : `${key} = ${derived}`),
          'aria-label': `${t('cassette.v2.profileEditor.parameters')} ${key} ${row.label}`
        });
      };

      const addAttachmentToWorkpiece = (workpieceId, targetWorkpieceId = '', targetFaceId = '') => {
        closeInlineEditor();
        const targetWorkpiece = workpieces.value.find(workpiece => (
          workpiece.id === targetWorkpieceId &&
          workpiece.id !== workpieceId
        ));
        if (!targetWorkpiece) return;
        const sourceFaceId = selectedNode.value?.workpieceId === workpieceId
          ? selectedNode.value.id
          : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId)?.id;
        const result = addCassetteV2WorkpieceAttachment(cassetteTree.value, workpieceId, {
          targetWorkpieceId: targetWorkpiece.id,
          targetFaceId: targetFaceId || targetWorkpiece.rootId,
          sourceFaceId,
          driver: false
        });
        if (!result.relationId) return;
        cassetteTree.value = result.tree;
        selectedRelationId.value = result.relationId;
        selectWorkpiece(workpieceId);
        inspectorSelection.value = 'attachment';
        openInlineEditor({
          type: 'attachment',
          relationId: result.relationId,
          x: 120,
          y: 120
        });
      };

      // The add-attachment control opens a workpiece→face picker (owner
      // decision 2026-10-17) — the target and its binding face are
      // chosen explicitly, never a click-armed connect mode.
      const openAttachmentPicker = (event, workpieceId) => {
        attachmentPickerSourceId.value = workpieceId;
        attachmentPicker.value?.toggle?.(event);
      };

      const closeAttachmentPicker = () => {
        attachmentPicker.value?.hide?.();
      };

      const deleteWorkpiece = (workpieceId) => {
        closeInlineEditor();
        const result = deleteCassetteV2Workpiece(cassetteTree.value, workpieceId);
        if (!result.deletedWorkpieceIds.length) return;
        cassetteTree.value = result.tree;
        if (result.deletedWorkpieceIds.includes(foldedPreviewWorkpieceId.value)) {
          foldedPreviewWorkpieceId.value = '';
        }
        if (result.deletedWorkpieceIds.includes(selectedWorkpieceOverrideId.value)) {
          selectedWorkpieceOverrideId.value = '';
        }
        selectedRelationId.value = '';
        selectWorkpieceForInspector(result.selectedWorkpieceId);
      };

      const addFaceAtEdge = (parentId, edgeIndex, options = {}) => {
        if (!parentId && parentId !== '') return;
        const result = addCassetteV2GraphChild(cassetteTree.value, parentId, edgeIndex, options);
        cassetteTree.value = result.tree;
        if (result.refused) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.edgeFull'), life: 3000 });
          return;
        }
        selectedNodeId.value = result.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
      };

      const handleDesignerAction = ({ edge, edgeIndex }) => {
        if (!edge?.nodeId && edge?.nodeId !== '') return;
        addFaceAtEdge(edge.nodeId, edge.edgeIndex ?? edgeIndex, {
          edgeLength: edge.edgeLength ?? edge.length,
          shardStart: edge.shardStart,
          shardEnd: edge.shardEnd
        });
      };

      const handleDesignerFaceSelect = ({ face }) => {
        if (!face?.nodeId && face?.nodeId !== '') return;
        if (inspectorSelection.value === 'attachment' && selectedWorkpieceRelation.value) {
          if (attachmentSourceKind(selectedWorkpieceRelation.value) === 'profile') {
            closeInlineEditor();
            selectedRelationId.value = '';
            selectedNodeId.value = face.nodeId;
            selectedWorkpieceOverrideId.value = '';
            inspectorSelection.value = 'face';
            return;
          }
          if (face.workpieceId === selectedWorkpieceRelation.value.sourceWorkpieceId) {
            updateSelectedWorkpieceRelation({ sourceFaceId: face.nodeId });
          } else if (face.workpieceId === selectedWorkpieceRelation.value.targetWorkpieceId) {
            updateSelectedWorkpieceRelation({ targetFaceId: face.nodeId });
          }
          return;
        }
        if (face.workpieceId && face.workpieceId !== selectedWorkpieceId.value) return;
        closeInlineEditor();
        selectedNodeId.value = face.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
      };

      const handleDesignerProfileSelect = ({ profile, clientX, clientY } = {}) => {
        if (!profile?.workpieceId) return;
        if (profile.relationId) {
          const point = Number.isFinite(clientX) && Number.isFinite(clientY)
            ? { clientX, clientY }
            : null;
          selectWorkpieceRelation(profile.relationId, point);
          return;
        }
        selectWorkpieceForInspector(profile.workpieceId);
      };

      const handleDesignerFoldSelect = ({ fold }) => {
        if (!fold?.foldNodeId && fold?.foldNodeId !== '') return;
        if (fold.workpieceId && fold.workpieceId !== selectedWorkpieceId.value) return;
        closeInlineEditor();
        selectedNodeId.value = fold.foldNodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'fold';
      };

      const handleDesignerFaceCommand = ({ face, command, x, y }) => {
        if (!face?.nodeId) return;
        selectedNodeId.value = face.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
        closeInlineEditor();
        if (command !== 'menu') return;
        openInlineEditor({ type: 'faceActions', nodeId: face.nodeId, x, y });
      };

      const handleDesignerPointEdit = ({ control, x, y }) => {
        if (!control?.nodeId || !control.key) return;
        const node = treeNodes.value.find(item => item.id === control.nodeId);
        selectedNodeId.value = control.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
        openInlineEditor({
          type: 'faceParameter',
          nodeId: control.nodeId,
          key: control.key,
          label: t(`cassette.v2.fields.${control.key}`),
          value: node?.parameters?.[control.key] ?? control.value,
          x,
          y
        });
      };

      const handleDesignerSectionEdit = ({ section, value }) => {
        const orientation = section?.orientation;
        if (!['vertical', 'horizontal'].includes(orientation)) return;
        const minValue = Number(section.minValue);
        const maxValue = Number(section.maxValue);
        const nextValue = Number(value);
        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || !Number.isFinite(nextValue) || maxValue === minValue) return;
        cassetteTree.value = {
          ...cassetteTree.value,
          sections: {
            ...(cassetteTree.value.sections || {}),
            [orientation]: {
              ...(cassetteTree.value.sections?.[orientation] || {}),
              ratio: Math.max(0, Math.min(1, (nextValue - minValue) / (maxValue - minValue)))
            }
          }
        };
      };

      const handleDesignerFoldAngleEdit = ({ fold, x, y }) => {
        if (!fold?.foldNodeId) return;
        const node = treeNodes.value.find(item => item.id === fold.foldNodeId);
        selectedNodeId.value = fold.foldNodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'fold';
        openInlineEditor({
          type: 'foldAngle',
          nodeId: fold.foldNodeId,
          label: t('cassette.v2.fields.foldAngle'),
          value: sanitizeAngleInput(node?.foldAngle || fold.angle || '90'),
          x,
          y
        });
      };

      const deleteFaceNode = (nodeId) => {
        const node = treeNodes.value.find(item => item.id === nodeId);
        if (!node?.parentId) return;
        const workpiece = workpieces.value.find(item => item.id === node.workpieceId);
        const selectedWorkpieceRootId = workpiece?.rootId || cassetteTree.value.rootId;
        const removeIds = new Set([node.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const candidate of cassetteTree.value.nodes) {
            if (candidate.parentId && removeIds.has(candidate.parentId) && !removeIds.has(candidate.id)) {
              removeIds.add(candidate.id);
              changed = true;
            }
          }
        }
        cassetteTree.value = {
          ...cassetteTree.value,
          nodes: cassetteTree.value.nodes.filter(candidate => !removeIds.has(candidate.id))
        };
        selectedNodeId.value = selectedWorkpieceRootId;
        selectedWorkpieceOverrideId.value = workpiece?.id || '';
        inspectorSelection.value = 'face';
        closeInlineEditor();
      };

      // --- render helpers ---

      const renderGlobalParameters = () => h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
        h('div', { class: 'flex items-center justify-between gap-2' }, [
          h('small', { class: 'text-muted text-supporting' }, t('cassette.v2.globalParameters')),
          h(Button, {
            icon: 'pi pi-plus',
            severity: 'secondary',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('common.add'),
            onClick: addGlobalParameter
          })
        ]),
        ...globalParameterEntries.value.map(parameter => h('div', { key: parameter.key, class: 'flex min-w-0 items-center gap-2' }, [
          h(InputText, {
            modelValue: parameterNameDraft.text(`global ${parameter.key}`, parameter.key),
            ...parameterNameDraft.handlers(`global ${parameter.key}`, parameter.key, next => {
              renameGlobalParameter(parameter.key, next);
            }),
            size: 'small',
            class: 'w-14 shrink-0 font-mono text-xs',
            'aria-label': `${t('cassette.v2.profileEditor.parameterName')} ${parameter.key}`
          }),
          h(CassetteExpressionEditor, {
            class: 'min-w-0 flex-1',
            modelValue: parameter.value,
            parameters: expressionParametersForGlobal(parameter.key),
            parameterNames: expressionParameterNamesForGlobal(parameter.key),
            'onUpdate:modelValue': value => updateGlobalParameter(parameter.key, value)
          }),
          h(Button, {
            icon: 'pi pi-trash',
            severity: 'secondary',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('common.delete'),
            disabled: usedParameterNames.value.has(parameter.key),
            onClick: () => deleteGlobalParameter(parameter.key)
          })
        ]))
      ]);

      const renderLayerRows = () => h('section', { class: 'flex min-w-0 flex-col gap-1' }, [
        h('small', { class: 'text-muted text-supporting' }, t('common.layers')),
        ...layerRows.value.map(row => h('div', {
          key: row.key,
          class: ['flex min-w-0 items-center gap-2 py-0.5', row.present ? '' : 'opacity-50']
        }, [
          h(Checkbox, {
            modelValue: row.present ? visibleLayerNames.value : false,
            value: row.layer?.name,
            inputId: layerInputId(row),
            size: 'small',
            disabled: !row.present,
            'onUpdate:modelValue': row.present ? updateVisibleLayerNames : undefined
          }),
          h('label', { for: layerInputId(row), class: 'min-w-0 flex-1 truncate', title: row.label }, row.label),
          (row.orgPen || row.tablePen) && (row.orgPen || row.tablePen)?.color
            ? h('span', {
                class: 'block h-[3px] w-8 shrink-0 rounded-full',
                style: { backgroundColor: row.orgPen?.fields?.stroke?.color || row.tablePen.color },
                ...(row.orgPen ? { title: entitySelectLabel(row.orgPen, '') } : {}),
                'aria-hidden': 'true'
              })
            : null
        ]))
      ]);

      const renderPalette = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        sessionDraftAvailable.value
          ? h(Message, { severity: 'info', size: 'small', closable: false }, () => [
              h('div', { class: 'flex flex-col gap-2' }, [
                h('span', null, t('cassette.v2.autosaveDraftAvailable')),
                h('div', { class: 'flex flex-wrap gap-1' }, [
                  h(Button, { label: t('cassette.v2.recoverDraft'), size: 'small', onClick: recoverSessionDraft }),
                  h(Button, { label: t('cassette.v2.discardDraft'), severity: 'secondary', text: true, size: 'small', onClick: discardSessionDraft })
                ])
              ])
            ])
          : null,
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto' }, [
          renderGlobalParameters(),
          renderLayerRows()
        ])
      ]);

      const renderInlineEditor = () => {
        if (!inlineEditor.value) return null;
        const editor = inlineEditor.value;
        const relation = inlineEditorRelation.value;
        const anchorKey = inlineEditorAnchorKey.value;
        let body;
        if (editor.type === 'faceActions') {
          const node = inlineEditorNode.value;
          const fillId = `face-fill-${editor.nodeId}`;
          body = h('div', { class: 'flex flex-col gap-2' }, [
            h('div', { class: 'flex cursor-move items-center gap-1', onMousedown: event => { event.preventDefault(); startInlineEditorDrag(event); } }, [
              h(Select, {
                modelValue: inlineEditorFaceRole.value,
                options: faceRoleOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.faceRole'),
                onMousedown: event => event.stopPropagation(),
                'onUpdate:modelValue': value => updateFaceRole(editor.nodeId, value)
              }),
              h(Button, {
                icon: 'pi pi-times',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('common.close'),
                onMousedown: event => event.stopPropagation(),
                onClick: closeInlineEditor
              })
            ]),
            inlineEditorNode.value?.parentId
              ? h('div', { class: 'flex flex-col gap-1 text-muted text-label' }, [
                  h('span', { class: 'truncate' }, t('cassette.v2.fields.edgeStart')),
                  h(CassetteExpressionEditor, {
                    modelValue: inlineEditorNode.value?.parameters?.edgeStart ?? '0',
                    parameters: globalParameters.value,
                    parameterNames: globalParameterNames.value,
                    'onUpdate:modelValue': value => updateFaceParameter(editor.nodeId, 'edgeStart', value)
                  })
                ])
              : null,
            h('div', { class: 'flex items-center gap-2' }, [
              h(Checkbox, {
                modelValue: node?.parameters?.defaultLength === 'inherit',
                binary: true,
                inputId: fillId,
                size: 'small',
                'onUpdate:modelValue': value => updateFaceParameter(
                  editor.nodeId,
                  'defaultLength',
                  value ? 'inherit' : resolvedFaceWidth(node)
                )
              }),
              h('label', { for: fillId, class: 'min-w-0 flex-1 truncate text-label' }, t('cassette.v2.fields.fillEdge'))
            ]),
            node?.parameters?.defaultLength !== 'inherit'
              ? h('div', { class: 'flex flex-col gap-1 text-muted text-label' }, [
                  h('span', { class: 'truncate' }, t('cassette.v2.fields.faceWidth')),
                  h(CassetteExpressionEditor, {
                    modelValue: node?.parameters?.defaultLength ?? '0',
                    parameters: globalParameters.value,
                    parameterNames: globalParameterNames.value,
                    'onUpdate:modelValue': value => updateFaceParameter(editor.nodeId, 'defaultLength', value)
                  })
                ])
              : null,
            h(Button, {
              icon: 'pi pi-pen-to-square',
              label: t('cassette.v2.editFaceShape'),
              severity: 'secondary',
              size: 'small',
              onClick: () => openFaceShapeSketch(editor.nodeId)
            }),
            inlineEditorNode.value?.sketch
              ? h(Button, {
                  icon: 'pi pi-undo',
                  label: t('cassette.v2.useTrapezoidFace'),
                  severity: 'secondary',
                  text: true,
                  size: 'small',
                  onClick: () => useTrapezoidFace(editor.nodeId)
                })
              : null,
            inlineEditorNode.value?.parentId
              ? h(Button, {
                  icon: 'pi pi-trash',
                  label: t('cassette.v2.deleteFace'),
                  severity: 'danger',
                  size: 'small',
                  onClick: () => deleteFaceNode(editor.nodeId)
                })
              : null
          ]);
        } else if (editor.type === 'attachment' && relation) {
          // Per-kind field sets (attachmentSourceKind owns the mapping):
          // workpiece attachments edit symmetric host/self sections —
          // face, side, basis snap, and both offsets per section — with
          // no mirror, driver, or delete (the panel row owns removal).
          const kind = attachmentSourceKind(relation);
          const profileRow = kind === 'profile'
            ? workpieceRowById.value.get(relation.sourceWorkpieceId)
            : null;
          // PrimeVue IftaLabel fields with native InputText/Select controls.
          const shortLabel = key => t(ATTACHMENT_SHORT_LABELS[key] || key);
          const arrayValueShortLabel = relation => t(
            relation.arrayMode === 'spacing'
              ? 'cassette.v2.attachmentFields.short.arraySpacing'
              : 'cassette.v2.attachmentFields.short.arrayCount'
          );
          const fieldId = key => `cassette-profile-${relation.id}-${key}`;
          const expressionError = (value, parameters, allowEmpty = false) => (
            expressionErrorOf(value, parameters, t('cassette.v2.expression.empty'), allowEmpty)
          );
          const labeledField = (label, control, id, className = '', title = '') => h(IftaLabel, {
            class: className || 'w-full'
          }, [
            control,
            h('label', { for: id, title: title || label }, label)
          ]);
          const textField = (id, label, value, draftKey, commit, parameters, allowEmpty = false) => {
            const error = expressionError(value, parameters, allowEmpty);
            return h(InputText, {
              id,
              fluid: true,
              modelValue: attachmentDraft.text(draftKey, value),
              ...attachmentDraft.handlers(draftKey, value, commit),
              invalid: Boolean(error),
              title: error || label,
              'aria-label': label
            });
          };
          const expressionField = (labelKey, value, key, { className = '', allowEmpty = false } = {}) => {
            const id = fieldId(key);
            const draftKey = `attachment:${relation.id}:${key}`;
            return labeledField(
              shortLabel(labelKey),
              textField(id, t(labelKey), value, draftKey, next => updateInlineAttachmentRelation({ [key]: next }), globalParameters.value, allowEmpty),
              id,
              className,
              t(labelKey)
            );
          };
          const selectField = (labelKey, modelValue, options, key, className = '') => {
            const id = fieldId(key);
            return labeledField(
              shortLabel(labelKey),
              h(Select, {
                inputId: id,
                modelValue,
                options: Array.isArray(options) ? options : options?.value || [],
                optionLabel: 'label',
                optionValue: 'value',
                fluid: true,
                'aria-label': t(labelKey),
                title: t(labelKey),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ [key]: value })
              }),
              id,
              className,
              t(labelKey)
            );
          };
          const arrayValueField = (relation) => {
            const id = fieldId('arrayValue');
            const draftKey = `attachment:${relation.id}:arrayValue`;
            return labeledField(
              arrayValueShortLabel(relation),
              textField(
                id,
                arrayValueLabel(relation),
                arrayValue(relation),
                draftKey,
                value => updateInlineAttachmentRelation(arrayValuePatch(relation, value)),
                globalParameters.value
              ),
              id,
              '',
              arrayValueLabel(relation)
            );
          };
          const dragHandle = fields => h('div', {
            class: 'flex cursor-move items-center gap-1',
            onMousedown: event => { event.preventDefault(); startInlineEditorDrag(event); }
          }, [
            ...fields,
            h(Button, {
              icon: 'pi pi-times',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('common.close'),
              onMousedown: event => event.stopPropagation(),
              onClick: closeInlineEditor
            })
          ]);
          if (kind === 'workpiece') {
            const section = (labelKey, fields) => h('div', { class: 'flex flex-col gap-1' }, [
              h('div', { class: 'text-muted text-label' }, t(labelKey)),
              h('div', { class: 'grid grid-cols-2 gap-2' }, fields)
            ]);
            body = h('div', { class: 'flex w-96 flex-col gap-2' }, [
              dragHandle([]),
              section('cassette.v2.attachmentFields.hostSection', [
                selectField('cassette.v2.attachmentFields.targetFace', relation.targetFaceId, targetFaceOptions, 'targetFaceId'),
                selectField('cassette.v2.attachmentFields.side', relation.targetSide, sideOptions, 'targetSide'),
                selectField('cassette.v2.attachmentFields.targetSnap', relation.targetSnap, snapOptions, 'targetSnap'),
                expressionField('cassette.v2.attachmentFields.edgeMargin', relation.offsetX, 'offsetX'),
                expressionField('cassette.v2.attachmentFields.normalOffset', relation.offsetY, 'offsetY')
              ]),
              section('cassette.v2.attachmentFields.selfSection', [
                selectField('cassette.v2.attachmentFields.sourceFace', relation.sourceFaceId, sourceFaceOptions, 'sourceFaceId'),
                selectField('cassette.v2.attachmentFields.side', relation.sourceSide, sideOptions, 'sourceSide'),
                selectField('cassette.v2.attachmentFields.sourceSnap', relation.sourceSnap, snapOptions, 'sourceSnap'),
                expressionField('cassette.v2.attachmentFields.edgeMargin', relation.sourceOffsetX, 'sourceOffsetX'),
                expressionField('cassette.v2.attachmentFields.normalOffset', relation.sourceOffsetY, 'sourceOffsetY'),
                expressionField('cassette.v2.attachmentFields.rotation', relation.rotation, 'rotation')
              ])
            ]);
          } else {
            body = h('div', { class: 'flex w-96 flex-col gap-1.5' }, [
              dragHandle([
                selectField('cassette.v2.attachmentFields.targetFace', relation.targetFaceId, targetFaceOptions, 'targetFaceId', 'min-w-0 flex-1'),
                kind === 'profile'
                  ? h(Button, {
                      icon: 'pi pi-pencil',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      'aria-label': t('cassette.v2.editProfile'),
                      title: t('cassette.v2.editProfile'),
                      onMousedown: event => event.stopPropagation(),
                      onClick: () => openProfileSketch(relation.sourceWorkpieceId)
                    })
                  : null,
                kind === 'profile'
                  ? h(Button, {
                      icon: 'pi pi-trash',
                      severity: 'danger',
                      text: true,
                      rounded: true,
                      size: 'small',
                      'aria-label': t('cassette.v2.deleteWorkpiece'),
                      title: t('cassette.v2.deleteWorkpiece'),
                      onMousedown: event => event.stopPropagation(),
                      onClick: () => deleteWorkpiece(relation.sourceWorkpieceId)
                    })
                  : null
              ]),
              h('div', { class: 'grid grid-cols-2 gap-1.5' }, [
                selectField('cassette.v2.attachmentFields.targetSnap', relation.targetSnap, snapOptions, 'targetSnap'),
                expressionField('cassette.v2.attachmentFields.edgeMargin', relation.offsetX, 'offsetX'),
                expressionField('cassette.v2.attachmentFields.normalOffset', relation.offsetY, 'offsetY'),
                expressionField('cassette.v2.attachmentFields.rotation', relation.rotation, 'rotation'),
                kind === 'hardware'
                  ? selectField('cassette.v2.attachmentFields.side', relation.targetSide, sideOptions, 'targetSide')
                  : null,
                selectField('cassette.v2.attachmentFields.placementMode', relation.placementMode, placementModeOptions, 'placementMode'),
                relation.placementMode === 'edgeArray'
                  ? selectField('cassette.v2.attachmentFields.arrayEdge', relation.arrayEdge, attachableEdgeOptions(relation.targetFaceId), 'arrayEdge')
                  : null,
                relation.placementMode === 'edgeArray'
                  ? selectField('cassette.v2.attachmentFields.arrayMode', relation.arrayMode, arrayModeOptions, 'arrayMode')
                  : null,
                relation.placementMode === 'edgeArray'
                  ? arrayValueField(relation)
                  : null,
                kind === 'profile'
                  ? h('div', { class: 'col-span-2 flex min-w-0 gap-1' }, [
                      h(Button, {
                        icon: 'pi pi-arrows-h',
                        severity: relation.mirrorX ? 'primary' : 'secondary',
                        text: true,
                        rounded: true,
                        size: 'small',
                        class: 'min-w-0 flex-1',
                        label: 'X',
                        'aria-label': t('cassette.v2.attachmentFields.mirrorX'),
                        title: t('cassette.v2.attachmentFields.mirrorX'),
                        onClick: () => updateInlineAttachmentRelation({ mirrorX: !relation.mirrorX })
                      }),
                      h(Button, {
                        icon: 'pi pi-arrows-v',
                        severity: relation.mirrorY ? 'primary' : 'secondary',
                        text: true,
                        rounded: true,
                        size: 'small',
                        class: 'min-w-0 flex-1',
                        label: 'Y',
                        'aria-label': t('cassette.v2.attachmentFields.mirrorY'),
                        title: t('cassette.v2.attachmentFields.mirrorY'),
                        onClick: () => updateInlineAttachmentRelation({ mirrorY: !relation.mirrorY })
                      })
                    ])
                  : null
              ]),
              kind === 'profile' && profileRow
                ? h('div', null, [
                    h(Divider),
                    h('div', { class: 'grid grid-cols-2 gap-x-2 gap-y-1' }, profileParameterFields(profileRow))
                  ])
                : null
            ]);
          }
        } else if (editor.type === 'faceParameter' && anchorKey) {
          body = h('div', { class: 'flex min-w-64 flex-col gap-2' }, [
            h('div', { class: 'flex cursor-move items-start gap-1', onMousedown: event => { event.preventDefault(); startInlineEditorDrag(event); } }, [
              h(CassetteExpressionEditor, {
                class: 'min-w-0 flex-1',
                modelValue: editor.value,
                parameters: inlineEditorParameters.value,
                parameterNames: globalParameterNames.value,
                contextTokens: inlineEditorContextTokens.value,
                onMousedown: event => event.stopPropagation(),
                'onUpdate:modelValue': updateInlineEditorValue
              }),
              h(Button, {
                icon: 'pi pi-times',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('common.close'),
                onMousedown: event => event.stopPropagation(),
                onClick: closeInlineEditor
              })
            ]),
            h(Select, {
              modelValue: inlineEditorAnchorValue.value,
              options: anchorOptions.value,
              optionLabel: 'label',
              optionValue: 'value',
              class: 'w-full',
              size: 'small',
              'aria-label': t(`cassette.v2.fields.${anchorKey}`),
              title: t(`cassette.v2.fields.${anchorKey}`),
              'onUpdate:modelValue': value => updateFaceParameter(editor.nodeId, anchorKey, value)
            })
          ]);
        } else {
          body = h('div', { class: 'flex min-w-64 cursor-move items-start gap-1', onMousedown: event => { event.preventDefault(); startInlineEditorDrag(event); } }, [
            h(CassetteExpressionEditor, {
              class: 'min-w-0 flex-1',
              modelValue: editor.value,
              parameters: inlineEditorParameters.value,
              parameterNames: globalParameterNames.value,
              contextTokens: inlineEditorContextTokens.value,
              onMousedown: event => event.stopPropagation(),
              'onUpdate:modelValue': updateInlineEditorValue
            }),
            h(Button, {
              icon: 'pi pi-times',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('common.close'),
              onMousedown: event => event.stopPropagation(),
              onClick: closeInlineEditor
            })
          ]);
        }
        return h('div', {
          class: 'absolute z-[120] min-w-64 rounded-ui border border-content-border bg-content p-2 shadow-overlay',
          style: { left: `${editor.x}px`, top: `${editor.y}px` },
          tabindex: '-1',
          onKeydown: event => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            event.preventDefault();
            closeInlineEditor();
          }
        }, [body]);
      };

      const workpieceRowById = computed(() => new Map(workpieceRows.value.map(row => [row.id, row])));

      const workpieceTypeIcon = (row) => h('i', {
        class: ['shrink-0 text-sm', row.isProfile
          ? 'pi pi-wave-pulse'
          : row.isHardware
            ? 'ck-entity-icon ck-entity-icon-bolt'
            : 'ck-entity-icon ck-entity-icon-workpiece'].join(' '),
        style: { color: `hsl(${hueForWorkpiece(row.id)} 68% 45%)` },
        'aria-hidden': 'true'
      });

      // Each bound parameter is a PrimeVue IftaLabel field: the name is
      // the infield label, the expression value sits in the input; the
      // derived value rides the label's title.
      const profileParameterFields = (row) => [...(row?.boundParameterKeys || [])].map((key) => {
        const instance = row.instanceParameters || {};
        const authored = row.authoredParameters || {};
        const value = Object.prototype.hasOwnProperty.call(instance, key)
          ? instance[key]
          : authored[key];
        const derived = row.parameters?.[key];
        const id = `cassette-profile-param-${row.id}-${key}`;
        return h(IftaLabel, {
          key: `${row.id}-${key}`,
          class: 'min-w-0'
        }, [
          profileParameterField(row, key, value, id),
          h('label', {
            for: id,
            title: derived === undefined ? key : `${key} = ${derived}`
          }, key)
        ]);
      });

      const workpieceDetailBlocks = (row) => [
        row.id === selectedWorkpieceId.value && row.isHardware
          ? h('div', { class: 'mt-2 flex flex-col gap-2 pl-4' }, [
              h('div', { class: 'grid grid-cols-2 gap-2' }, [
                h(Select, {
                  modelValue: row.family,
                  options: hardwareFamilyOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  size: 'small',
                  class: 'w-full',
                  'aria-label': t('cassette.v2.hardwareFields.family'),
                  'onUpdate:modelValue': value => updateSelectedHardware({ family: value })
                }),
                row.family === 'hanger_clip'
                  ? h(Select, {
                      modelValue: row.productionMode || 'integralCut',
                      options: hangerProductionModeOptions.value,
                      optionLabel: 'label',
                      optionValue: 'value',
                      size: 'small',
                      class: 'w-full',
                      'aria-label': t('cassette.v2.hardwareFields.productionMode'),
                      'onUpdate:modelValue': value => updateSelectedHardware({ productionMode: value })
                    })
                  : null
              ]),
              h('div', { class: 'grid grid-cols-3 gap-2' },
                Object.keys(hardwareDefaultParameters(row.family)).map(key => h('div', {
                  key: `${row.id}-${key}`,
                  class: 'flex min-w-0 flex-col gap-1 text-muted text-label'
                }, [
                  h('span', { class: 'truncate' }, key),
                  h(InputNumber, {
                    modelValue: Number(row.parameters?.[key]),
                    size: 'small',
                    class: 'w-full',
                    'aria-label': key,
                    'onUpdate:modelValue': value => updateSelectedHardware({
                      parameters: { ...(row.parameters || {}), [key]: String(value ?? 0) }
                    })
                  })
                ])))
            ])
          : null
      ].filter(Boolean);

      const attachmentStatusIcon = (relationId, status) => status !== 'ok'
        ? h('i', {
            class: `pi ${status === 'refused' ? 'pi-ban' : status === 'impossible' ? 'pi-times-circle' : 'pi-question-circle'} shrink-0`,
            style: { color: `var(--ck-status-${relationStatusSeverity(status)})` },
            role: 'img',
            'aria-label': t(`cassette.v2.attachmentStatus.${status}`),
            title: [
              t(`cassette.v2.attachmentStatus.${status}`),
              profileEmbeddingErrorById.value.get(relationId) || ''
            ].filter(Boolean).join(' — ')
          })
        : null;

      // A single-attachment dependent under its host: the workpiece
      // itself (icon, name, detail blocks on selection) with its
      // attachment settings inline — positioning popup, profile edit,
      // and delete (the attachment is the workpiece's placement).
      const nestedDependentRow = (hostRow, relationRow) => {
        const dependent = workpieceRowById.value.get(relationRow.relation.sourceWorkpieceId);
        if (!dependent) return null;
        const isSelected = dependent.id === selectedWorkpieceId.value;
        return h('div', {
          key: `${hostRow.id}-dep-${dependent.id}`,
          class: 'flex flex-col gap-1'
        }, [
          h('div', { class: 'flex min-w-0 items-start gap-1' }, [
            h('button', {
              type: 'button',
              class: ['flex min-w-0 flex-1 flex-col gap-0.5 rounded-ui border px-2 py-1 text-left', isSelected ? 'border-primary bg-subtle' : 'border-content-border'],
              onClick: () => (dependent.isProfile
                ? selectProfileWorkpiece(dependent.id)
                : selectWorkpieceForInspector(dependent.id))
            }, [
              h('div', { class: 'flex min-w-0 items-center gap-2' }, [
                workpieceTypeIcon(dependent),
                h('span', { class: 'truncate text-body' }, dependent.label),
                attachmentStatusIcon(relationRow.relation.id, relationRow.status)
              ]),
              relationRow.crumbs.length
                ? h('small', { class: 'truncate text-muted' }, relationRow.crumbs.join('  ›  '))
                : null
            ]),
            h('div', { class: 'flex shrink-0 items-start' }, [
              !dependent.isProfile
                ? h('div', { class: 'flex shrink-0 items-start' }, [
                    h(Button, {
                      icon: 'pi pi-sliders-h',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      'aria-label': t('cassette.v2.attachmentPosition'),
                      title: t('cassette.v2.attachmentPosition'),
                      onClick: event => selectWorkpieceRelation(relationRow.relation.id, event)
                    }),
                    h(Button, {
                      icon: 'pi pi-trash',
                      severity: 'danger',
                      text: true,
                      rounded: true,
                      size: 'small',
                      'aria-label': t('cassette.v2.deleteWorkpiece'),
                      title: t('cassette.v2.deleteWorkpiece'),
                      onClick: () => deleteWorkpiece(dependent.id)
                    })
                  ])
                : null
            ])
          ]),
          ...workpieceDetailBlocks(dependent)
        ]);
      };

      const plainRelationRow = (row, relationRow) => h('div', {
        key: `${row.id}-${relationRow.relation.id}-${relationRow.direction}`,
        class: 'flex min-w-0 items-start gap-1'
      }, [
        h('button', {
          type: 'button',
          class: ['flex min-w-0 flex-1 flex-col gap-0.5 rounded-ui border px-2 py-1 text-left', relationRow.relation.id === selectedRelationId.value ? 'border-primary bg-subtle' : 'border-content-border'],
          onClick: event => selectWorkpieceRelation(relationRow.relation.id, event)
        }, [
          h('div', { class: 'flex min-w-0 items-center gap-2' }, [
            h('i', { class: 'pi pi-link shrink-0 text-xs text-muted', 'aria-hidden': 'true' }),
            h('span', { class: 'truncate text-body' }, relationRow.otherLabel),
            attachmentStatusIcon(relationRow.relation.id, relationRow.status)
          ]),
          relationRow.crumbs.length
            ? h('small', { class: 'truncate text-muted' }, relationRow.crumbs.join('  ›  '))
            : null
        ]),
        !workpieceRowById.value.get(relationRow.relation.sourceWorkpieceId)?.isProfile
          ? h('div', { class: 'flex shrink-0 items-start gap-0' }, [
              h(Button, {
                icon: 'pi pi-sliders-h',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                class: 'mt-0.5 shrink-0',
                'aria-label': t('cassette.v2.attachmentPosition'),
                title: t('cassette.v2.attachmentPosition'),
                onClick: event => selectWorkpieceRelation(relationRow.relation.id, event)
              }),
              h(Button, {
                icon: 'pi pi-trash',
                severity: 'danger',
                text: true,
                rounded: true,
                size: 'small',
                class: 'mt-0.5 shrink-0',
                'aria-label': t('cassette.v2.removeAttachment'),
                title: t('cassette.v2.removeAttachment'),
                onClick: () => deleteWorkpieceRelation(relationRow.relation.id)
              })
            ])
          : null
      ]);

      const renderSketchMode = () => {
        if (!sketchEditorMounted.value) return null;
        const active = sketchMode.value;
        const mode = active || sketchEditorMode.value;
        const face = mode === 'face';
        const open = Boolean(active);
        const title = face
          ? t('cassette.v2.faceShapeEditor.title')
          : t('cassette.v2.profileEditor.title');
        const node = face
          ? treeNodes.value.find(item => item.id === editingFaceNodeId.value)
          : null;
        const workpiece = workpieces.value.find(item => (
          item.id === (face ? node?.workpieceId : editingProfileWorkpieceId.value)
        ));
        const target = [
          cassetteNameDraft.value,
          workpiece?.name || (face ? '' : profileDraft.value.name)
        ].filter(Boolean).join(' / ');
        const close = () => { if (face) cancelFaceSketch(); else cancelProfileSketch(); };
        const error = face ? faceShapeSketchError.value : profileSketchError.value;
        const actions = face
          ? [
              h(Button, {
                icon: 'pi pi-save',
                severity: 'primary',
                rounded: true,
                size: 'small',
                disabled: !faceShapeReady.value,
                'aria-label': t('common.save'),
                title: error || t('common.save'),
                onClick: saveFaceShapeDraft
              }),
              h(Button, {
                icon: 'pi pi-undo',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('cassette.v2.useTrapezoidFace'),
                title: t('cassette.v2.useTrapezoidFace'),
                onClick: () => useTrapezoidFace()
              })
            ]
          : [
              h(Button, {
                icon: 'pi pi-save',
                severity: 'primary',
                rounded: true,
                size: 'small',
                disabled: !profileDraftReady.value,
                'aria-label': t('common.save'),
                title: error || t('common.save'),
                onClick: saveProfileDraft
              }),
              ...(profileLibraryAvailable.value
                ? [
                    h(Button, {
                      icon: profileDraft.value.libraryId ? 'pi pi-cloud-upload' : 'pi pi-bookmark',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      disabled: !profileDraftAuthoredReady.value,
                      'aria-label': profileDraft.value.libraryId
                        ? t('cassette.v2.profileEditor.updateLibrary')
                        : t('cassette.v2.profileEditor.saveToLibrary'),
                      title: profileDraftAuthoredReady.value
                        ? (profileDraft.value.libraryId
                            ? t('cassette.v2.profileEditor.updateLibrary')
                            : t('cassette.v2.profileEditor.saveToLibrary'))
                        : t('cassette.v2.profileEditor.invalidSketch'),
                      onClick: profileDraft.value.libraryId
                        ? updateProfileLibraryRecord
                        : () => saveProfileDraftToLibrary()
                    }),
                    profileDraft.value.libraryId
                      ? h(Button, {
                          icon: 'pi pi-copy',
                          severity: 'secondary',
                          text: true,
                          rounded: true,
                          size: 'small',
                          disabled: !profileDraftAuthoredReady.value,
                          'aria-label': t('cassette.v2.profileEditor.saveAsToLibrary'),
                          title: profileDraftAuthoredReady.value
                            ? t('cassette.v2.profileEditor.saveAsToLibrary')
                            : t('cassette.v2.profileEditor.invalidSketch'),
                          onClick: () => saveProfileDraftToLibrary({ asNew: true })
                        })
                      : null,
                    profileDraft.value.libraryId
                      ? h(Button, {
                          icon: 'pi pi-trash',
                          severity: 'danger',
                          text: true,
                          rounded: true,
                          size: 'small',
                          'aria-label': t('cassette.v2.profileEditor.deleteFromLibrary'),
                          title: t('cassette.v2.profileEditor.deleteFromLibrary'),
                          onClick: openProfileDeletePopover
                        })
                      : null
                  ]
                : [])
            ];
        return h('section', {
          class: [
            'absolute inset-0 z-[110] flex min-h-0 flex-col gap-2 overflow-hidden bg-content p-3',
            open ? '' : 'invisible pointer-events-none'
          ],
          'data-sketch-mode': active || undefined,
          'aria-hidden': open ? undefined : 'true',
          'aria-label': title
        }, [
          h('div', { class: 'flex shrink-0 flex-wrap items-center gap-2' }, [
            h(Button, {
              icon: 'pi pi-arrow-left',
              label: t('common.back'),
              severity: 'secondary',
              text: true,
              size: 'small',
              'aria-label': t('cassette.v2.sketchMode.backToCassette'),
              title: t('cassette.v2.sketchMode.backToCassette'),
              onClick: close
            }),
            h('div', { class: 'flex min-w-0 flex-col' }, [
              h('strong', { class: 'truncate' }, title),
              target ? h('span', { class: 'truncate text-xs text-muted' }, target) : null
            ]),
            h('div', { class: 'ml-auto flex flex-wrap items-center gap-2' }, actions)
          ]),
          face
            ? null
            : h('div', { class: 'flex shrink-0 flex-wrap items-center gap-2' }, [
                h(InputText, {
                  modelValue: profileDraft.value.name,
                  'onUpdate:modelValue': value => { profileDraft.value.name = value; },
                  placeholder: t('cassette.v2.profileEditor.name'),
                  size: 'small',
                  class: 'min-w-40 flex-1'
                }),
                h(Select, {
                  modelValue: profileDraft.value.kind,
                  options: profileKindOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  appendTo: 'self',
                  size: 'small',
                  class: 'w-28',
                  'aria-label': t('cassette.v2.profileEditor.kind'),
                  'onUpdate:modelValue': value => { profileDraft.value.kind = value; }
                }),
                h(Select, {
                  modelValue: profileDraft.value.process,
                  options: profileProcessOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  appendTo: 'self',
                  size: 'small',
                  class: 'w-36',
                  'aria-label': t('cassette.v2.profileEditor.process'),
                  'onUpdate:modelValue': value => { profileDraft.value.process = value; }
                }),
                profileLibraryAvailable.value
                  ? h('div', { class: 'w-44' }, [h(InstanceSelect, {
                    modelValue: null,
                    options: profileLibraryOptions.value,
                    optionLabel: 'label',
                    optionValue: 'value',
                    placeholder: t('cassette.v2.profileEditor.library'),
                    appendTo: 'self',
                    size: 'small',
                    'onUpdate:modelValue': value => {
                      applyProfileLibraryRecord(profileLibraryRecords.value.find(record => record?._id?.toString() === value));
                    }
                  })])
                  : null
              ]),
          error
            ? h(Message, { severity: 'warn', size: 'small', closable: false, class: 'shrink-0' }, () => error)
            : null,
          h(ProfileSketchEditor, {
            ref: sketchEditorRef,
            modelValue: face ? faceShapeDraft.value : profileDraft.value.sketch,
            mode: face ? 'face' : 'profile',
            active: open,
            initialView: sketchInitialView.value,
            viewSessionKey: sketchSessionKey.value,
            contextEntities: sketchContextEntities.value,
            basisStart: face ? faceShapeBasisStart.value : null,
            basisEnd: face ? faceShapeBasisEnd.value : null,
            contextFace: face ? faceShapeParentFace.value : [],
            externalParameters: globalParameters.value,
            'onUpdate:modelValue': value => {
              if (!open) return;
              if (face) faceShapeDraft.value = value;
              else profileDraft.value.sketch = value;
            },
            onOutlineError: value => {
              if (!open) return;
              if (face) faceShapeEditorError.value = value;
              else profileEditorError.value = value;
            }
          })
        ]);
      };

      const renderInspector = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' }, [
          h('div', { class: 'flex items-center justify-between gap-2' }, [
            h('strong', { class: 'truncate' }, t('cassette.v2.workpieces')),
            h('div', { class: 'flex items-center gap-1' }, [
              h(Tag, { value: assemblySummary.value, severity: 'secondary', size: 'small' }),
              h(Button, {
                icon: 'ck-entity-icon ck-entity-icon-bolt',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('cassette.v2.addHardware'),
                title: t('cassette.v2.addHardware'),
                onClick: event => openHardwarePicker(event)
              })
            ])
          ]),
          h(ScrollPanel, { class: 'min-h-0 flex-1 rounded-ui border border-content-border' }, () =>
            h('div', { class: 'flex flex-col' },
              workpieceRows.value.filter(row => !row.isNested).map(row => {
                const isNestedDependent = relationRow => relationRow.direction === 'in'
                  && nestedWorkpieceIds.value.has(relationRow.relation.sourceWorkpieceId);
                const dependentRows = row.relations
                  .filter(isNestedDependent)
                  .map(relationRow => nestedDependentRow(row, relationRow));
                const plainRows = row.relations
                  .filter(relationRow => !isNestedDependent(relationRow))
                  .map(relationRow => plainRelationRow(row, relationRow));
                return h('div', {
                  key: row.id,
                  class: 'border-b border-content-border p-2 last:border-b-0'
                }, [
                  h('div', { class: 'flex min-w-0 items-center gap-2' }, [
                    h('button', {
                      type: 'button',
                      class: ['flex min-w-0 flex-1 items-center gap-2 rounded-ui border border-transparent px-2 py-1 text-left', row.id === selectedWorkpieceId.value ? 'border-primary bg-subtle' : ''].filter(Boolean).join(' '),
                      onClick: () => (row.isProfile
                        ? selectProfileWorkpiece(row.id)
                        : selectWorkpieceForInspector(row.id))
                    }, [
                      workpieceTypeIcon(row),
                      h('span', { class: 'truncate' }, row.label),
                      row.parentCount > 1 ? h(Tag, { value: `×${row.parentCount}`, severity: 'secondary', size: 'small' }) : null
                    ]),
                    row.id === selectedWorkpieceId.value
                      ? h('div', { class: 'flex shrink-0 items-center' }, [
                          h(Button, {
                            icon: 'pi pi-plus',
                            severity: 'secondary',
                            text: true,
                            rounded: true,
                            size: 'small',
                            'aria-label': t('cassette.v2.addRelatedWorkpiece'),
                            title: t('cassette.v2.addRelatedWorkpiece'),
                            onClick: () => addWorkpieceFrom(row.id)
                          }),
                          h(Button, {
                            icon: 'pi pi-link',
                            severity: 'secondary',
                            text: true,
                            rounded: true,
                            size: 'small',
                            disabled: workpieces.value.length < 2,
                            'aria-label': t('cassette.v2.addAttachment'),
                            title: t('cassette.v2.addAttachment'),
                            onClick: event => openAttachmentPicker(event, row.id)
                          }),
                          row.id !== workpieces.value[0]?.id && !row.isProfile
                            ? h(Button, {
                                icon: 'pi pi-trash',
                                severity: 'danger',
                                text: true,
                                rounded: true,
                                size: 'small',
                                'aria-label': t('cassette.v2.deleteWorkpiece'),
                                title: t('cassette.v2.deleteWorkpiece'),
                                onClick: () => deleteWorkpiece(row.id)
                              })
                            : null
                        ])
                      : null
                  ]),
                  ...workpieceDetailBlocks(row),
                  dependentRows.length || plainRows.length
                    ? h('div', { class: 'mt-2 flex flex-col gap-1 pl-4' }, [
                        ...dependentRows,
                        ...plainRows
                      ])
                    : null
                ]);
              }))
          )
        ]),
        h('div', { class: 'h-48 shrink-0 overflow-hidden' }, [
          foldedPreviewMount({ expandable: true })
        ])
      ]);

      const foldedPreviewMount = ({ expandable = false } = {}) => h(CassetteFoldedPreview, {
        preview: cassettePreviewSource.value?.foldedPreview,
        selectedFaceId: selectedNodeId.value,
        selectedWorkpieceId: selectedWorkpieceId.value,
        isolatedWorkpieceId: foldedPreviewWorkpieceId.value,
        'onUpdate:isolatedWorkpieceId': value => { foldedPreviewWorkpieceId.value = value; },
        titleKey: 'cassette.v2.cassetteFoldedPreview',
        onWorkpieceSelect: selectWorkpieceForInspector,
        expandable,
        onExpand: () => { foldedExpanded.value = true; }
      });

      const renderOnboardingRail = () => {
        if (!showOnboardingRail.value) return null;
        const step = activeOnboardingStep.value;
        return h('div', {
          class: ['absolute z-[140] w-80 rounded-ui border border-content-border bg-content p-3 shadow-overlay', onboardingCalloutClass.value]
        }, [
          h('span', {
            class: ['absolute h-3 w-3 rotate-45 border border-content-border bg-content', onboardingChevronClass.value],
            'aria-hidden': 'true'
          }),
          h('div', { class: 'relative flex min-w-0 flex-col gap-2' }, [
            h('div', { class: 'flex min-w-0 items-start justify-between gap-2' }, [
              h('div', { class: 'flex min-w-0 flex-col' }, [
                h('strong', null, t(step.titleKey)),
                h('small', { class: 'text-muted' }, t(step.bodyKey))
              ]),
              h(Button, { icon: 'pi pi-times', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('common.close'), onClick: dismissOnboarding })
            ]),
            h('div', { class: 'flex items-center justify-between gap-2' }, [
              h(Tag, { value: `${onboardingIndex.value + 1}/${onboardingSteps.value.length}`, severity: 'secondary', size: 'small' }),
              h('div', { class: 'flex items-center gap-1' }, [
                h(Button, {
                  icon: 'pi pi-angle-left',
                  severity: 'secondary',
                  text: true,
                  rounded: true,
                  size: 'small',
                  disabled: onboardingIndex.value === 0,
                  'aria-label': t('common.back'),
                  onClick: previousOnboardingStep
                }),
                h(Button, {
                  icon: 'pi pi-angle-right',
                  severity: 'secondary',
                  text: true,
                  rounded: true,
                  size: 'small',
                  disabled: onboardingIndex.value >= onboardingSteps.value.length - 1,
                  'aria-label': t('common.next'),
                  onClick: nextOnboardingStep
                })
              ])
            ])
          ])
        ]);
      };

      // Cassette previews are payload-based, exactly like the platform's
      // card/detail slots: the picker hydrates each record's OCCS
      // document through the mount's loadDocument and renders it with
      // the same tree renderer and preview layer selection the bound
      // preview surface uses. Thumbnails cache by record id + updatedAt.
      const templateThumbnails = ref(new Map());

      const hydrateTemplateThumbnail = async (record) => {
        const key = `${record?._id || ''}:${record?.updatedAt || ''}`;
        if (!record || templateThumbnails.value.has(key)) return;
        templateThumbnails.value.set(key, null);
        const document = await props.persistence.loadDocument(record).catch(() => null);
        const graphTree = document?.extensions?.perigram?.graphTree
          || document?.graphTree
          || null;
        if (!graphTree) return;
        try {
          const drawing = await renderCassetteV2TreeToDrawing(graphTree);
          templateThumbnails.value.set(key, {
            drawing,
            visibleLayerNames: cassettePreviewLayerSelection(drawing)
          });
        } catch {
          // Quiet placeholder; the record stays loadable.
        }
      };

      const hydrateTemplateThumbnails = () => {
        templateRecords.value.forEach(record => { hydrateTemplateThumbnail(record); });
      };

      const templateThumbnailFor = (record) => (
        templateThumbnails.value.get(`${record?._id || ''}:${record?.updatedAt || ''}`) || null
      );

      return () => h(DesignerSurface, {
        class: 'relative gap-3',
        onKeydown: event => {
          if (event.key === 'Escape') handleDesignerEscape(event);
        }
      }, () => [
        sketchMode.value ? null : renderOnboardingRail(),
        h(DesignerWorkspace, {
          layout: 'lanes',
          class: 'min-h-0 flex-1',
          documentItems: sketchMode.value ? [] : documentDockItems.value,
          canvasItems: sketchMode.value ? [] : canvasDockItems.value
        }, {
          ...(sketchMode.value ? {} : {
            palette: renderPalette,
            inspector: renderInspector
          }),
          default: () => h('section', {
            ref: editorSurfaceRef,
            class: 'relative h-full min-h-0 w-full overflow-hidden'
          }, [
            h(DrawingCanvas, {
              ref: drawingCanvasRef,
              // Sticky editing viewport: live edits keep the user's
              // pan/zoom; the canvas remounts per opened document
              // (key) so a fresh cassette still fits.
              key: selectedTemplateId.value || 'draft',
              source: drawingCanvasSource.value,
              sourceType: 'geometry-preview',
              mode: 'designer',
              preserveViewport: true,
              visibleLayerNames: visibleLayerNames.value,
              selectedDesignerFaceId: selectedDesignerFaceId.value,
              selectedDesignerProfileId: selectedWorkpieceId.value,
              designerProfileSelectable: inlineEditor.value?.type !== 'attachment',
              designerSelectableWorkpieceIds: designerSelectableWorkpieceIds.value,
              showDesignerWorkpieceContext: showDesignerWorkpieceContext.value,
              onReady: handleDrawingReady,
              onLayerToggle: updateVisibleLayerNames,
              onDesignerAction: handleDesignerAction,
              onDesignerFaceSelect: handleDesignerFaceSelect,
              onDesignerProfileSelect: handleDesignerProfileSelect,
              onDesignerFoldSelect: handleDesignerFoldSelect,
              onDesignerFaceCommand: handleDesignerFaceCommand,
              onDesignerPointEdit: handleDesignerPointEdit,
              onDesignerSectionEdit: handleDesignerSectionEdit,
              onDesignerFoldAngleEdit: handleDesignerFoldAngleEdit
            }),
            previewError.value && !sketchMode.value
              ? h('div', { class: 'pointer-events-none absolute bottom-3 left-1/2 z-[130] w-[min(32rem,calc(100%-1rem))] -translate-x-1/2' }, [
                  h(Message, { severity: 'warn', size: 'small', closable: false }, () => previewError.value)
                ])
              : null,
            sketchMode.value ? null : renderInlineEditor(),
            renderSketchMode()
          ]),
        }),
        h(Popover, { ref: dockMenu }, () => [
          h('div', {
            class: 'flex min-w-72 flex-col gap-2',
            onMousedown: event => event.stopPropagation(),
            onClick: event => event.stopPropagation()
          }, [
            dockPopoverPanel.value === 'rename'
              ? h(InputText, {
                  modelValue: cassetteNameDraft.value,
                  'onUpdate:modelValue': value => { cassetteNameDraft.value = value; },
                  placeholder: t('cassette.name'),
                  class: 'w-full',
                  'aria-label': t('common.rename'),
                  onKeydown: event => {
                    if (event.key !== 'Enter') return;
                    event.stopPropagation();
                    event.preventDefault();
                    applyRename();
                  }
                })
              : null,
            dockPopoverPanel.value === 'open'
              ? h('div', { class: 'flex w-80 max-w-90 flex-col gap-1' },
                  templateRecords.value.map(record => {
                    const thumbnail = templateThumbnailFor(record);
                    return h('button', {
                      key: record?._id,
                      type: 'button',
                      class: 'flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left hover:bg-subtle',
                      onClick: () => {
                        loadTemplateInto(record?._id?.toString());
                        closeDockPopover();
                      }
                    }, [
                      h('span', { class: 'flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-ui border border-content-border' },
                        thumbnail
                          ? h(DrawingCanvas, {
                              source: thumbnail.drawing,
                              sourceType: 'geometry-preview',
                              mode: 'card',
                              fill: true,
                              visibleLayerNames: thumbnail.visibleLayerNames
                            })
                          : h('i', { class: 'pi pi-box text-muted' })),
                      h('span', { class: 'truncate' }, record?.name || t('common.unnamed'))
                    ]);
                  }))
              : null,
            dockPopoverPanel.value === 'rename'
              ? h(Button, {
                  icon: 'pi pi-check',
                  label: t('common.save'),
                  size: 'small',
                  disabled: !cassetteNameDraft.value.trim(),
                  onClick: () => applyRename()
                })
              : null
          ])
        ]),
        h(Popover, { ref: profilePicker }, () => h('div', { class: 'flex w-80 max-w-90 flex-col gap-1' }, [
          h(Button, {
            icon: 'pi pi-plus',
            label: t('cassette.v2.profileEditor.createNew'),
            severity: 'secondary',
            text: true,
            size: 'small',
            class: 'w-full justify-start',
            onClick: () => {
              closeProfilePicker();
              openProfileSketch();
            }
          }),
          profileLibraryAvailable.value && profileLibraryRecords.value.length
            ? h('div', { class: 'mt-1 flex flex-col border-t border-content-border pt-1' },
                profileLibraryRecords.value.map(record => {
                  const thumbnail = profileThumbnails.value[record?._id?.toString()] || null;
                  return h('button', {
                    key: record?._id,
                    type: 'button',
                    class: 'flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left hover:bg-subtle',
                    onClick: () => addProfileFromLibrary(record)
                  }, [
                    h('span', { class: 'flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-ui border border-content-border' },
                      thumbnail
                        ? h(DrawingCanvas, {
                            source: thumbnail,
                            sourceType: 'geometry-preview',
                            mode: 'card',
                            fill: true
                          })
                        : h('i', { class: 'pi pi-box text-muted' })),
                    h('span', { class: 'truncate' }, record?.name || t('cassette.v2.profileEditor.defaultName'))
                  ]);
                }))
            : null
        ])),
        h(Popover, { ref: profileDeletePopover }, () => h('div', { class: 'flex w-64 max-w-90 flex-col gap-2' }, [
          h('span', { class: 'text-sm' }, t('cassette.v2.profileEditor.deleteLibraryConfirm')),
          h(Button, {
            icon: 'pi pi-trash',
            label: t('common.delete'),
            severity: 'danger',
            size: 'small',
            onClick: deleteProfileLibraryRecord
          })
        ])),
        h(Popover, { ref: hardwarePicker }, () => h('div', { class: 'flex w-80 max-w-90 flex-col gap-1' }, [
          h(Button, {
            icon: 'pi pi-plus',
            label: t('cassette.v2.hardwareLibrary.createNew'),
            severity: 'secondary',
            text: true,
            size: 'small',
            class: 'w-full justify-start',
            onClick: () => {
              closeHardwarePicker();
              openHardwareDialog();
            }
          }),
          hardwareLibraryAvailable.value && hardwareLibraryRecords.value.length
            ? h('div', { class: 'mt-1 flex flex-col border-t border-content-border pt-1' },
                hardwareLibraryRecords.value.map(record => h('button', {
                  key: record?._id,
                  type: 'button',
                  class: 'flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left hover:bg-subtle',
                  onClick: () => addHardwareFromLibrary(record)
                }, [
                  h('i', { class: 'ck-entity-icon ck-entity-icon-bolt shrink-0 text-sm text-muted', 'aria-hidden': 'true' }),
                  h('span', { class: 'truncate' }, record?.name || ''),
                  h('small', { class: 'ml-auto shrink-0 text-muted' },
                    hardwareLabel(record?.fields?.family || 'bolt', record?.fields?.productionMode || ''))
                ])))
            : null
        ])),
        h(Popover, { ref: attachmentPicker }, () => {
          const sourceId = attachmentPickerSourceId.value;
          // Targets as workpiece → face trees: picking the face binds
          // the relation to it directly.
          const targets = workpieceRows.value.filter(row => row.id !== sourceId);
          return h('div', { class: 'flex w-72 max-w-90 flex-col gap-1' },
            targets.map(row => {
              const faces = treeNodes.value.filter(node => node.workpieceId === row.id);
              return h('div', { key: row.id, class: 'flex flex-col gap-0.5' }, [
                h('div', { class: 'flex items-center gap-2 px-1 py-0.5' }, [
                  workpieceTypeIcon(row),
                  h('span', { class: 'truncate text-xs text-muted' }, row.label)
                ]),
                ...faces.map(node => h('button', {
                  key: node.id,
                  type: 'button',
                  class: 'flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left hover:bg-subtle',
                  style: { paddingLeft: node.parentId ? '1.25rem' : undefined },
                  onClick: () => {
                    closeAttachmentPicker();
                    addAttachmentToWorkpiece(sourceId, row.id, node.id);
                  }
                }, [
                  h('i', { class: 'pi pi-link shrink-0 text-xs text-muted', 'aria-hidden': 'true' }),
                  h('span', { class: 'truncate font-mono text-xs' }, node.id)
                ]))
              ]);
            }));
        }),
        h(StandardDialog, {
          visible: hardwareDialogVisible.value,
          'onUpdate:visible': value => { hardwareDialogVisible.value = value; },
          header: t('cassette.v2.hardwareLibrary.title'),
          size: 'sm',
          showDefaultFooter: false
        }, () => h('div', { class: 'flex flex-col gap-3' }, [
          h(InputText, {
            modelValue: hardwareDraft.value.name,
            'onUpdate:modelValue': value => { hardwareDraft.value.name = value; },
            placeholder: t('cassette.v2.hardwareLibrary.name'),
            class: 'w-full'
          }),
          h('div', { class: 'grid grid-cols-2 gap-2' }, [
            h(Select, {
              modelValue: hardwareDraft.value.family,
              options: hardwareFamilyOptions.value,
              optionLabel: 'label',
              optionValue: 'value',
              class: 'w-full',
              'aria-label': t('cassette.v2.hardwareFields.family'),
              'onUpdate:modelValue': value => onHardwareDraftFamilyChange(value)
            }),
            hardwareDraft.value.family === 'hanger_clip'
              ? h(Select, {
                  modelValue: hardwareDraft.value.productionMode || 'integralCut',
                  options: hangerProductionModeOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  class: 'w-full',
                  'aria-label': t('cassette.v2.hardwareFields.productionMode'),
                  'onUpdate:modelValue': value => { hardwareDraft.value.productionMode = value; }
                })
              : null
          ]),
          h('div', { class: 'grid grid-cols-3 gap-2' },
            hardwareDraftParameterKeys.value.map(key => h('div', {
              key,
              class: 'flex min-w-0 flex-col gap-1 text-muted text-label'
            }, [
              h('span', { class: 'truncate' }, key),
              h(InputNumber, {
                modelValue: Number(hardwareDraft.value.parameters?.[key]),
                class: 'w-full',
                'aria-label': key,
                'onUpdate:modelValue': value => { hardwareDraft.value.parameters = { ...hardwareDraft.value.parameters, [key]: String(value ?? 0) }; }
              })
            ]))),
          h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
            h('div', { class: 'flex flex-wrap gap-2' }, [
              h(Button, {
                label: t('common.save'),
                icon: 'pi pi-save',
                size: 'small',
                onClick: saveHardwareDraft
              }),
              h(Button, {
                label: t('cassette.v2.hardwareLibrary.saveToLibrary'),
                icon: 'pi pi-bookmark',
                severity: 'secondary',
                size: 'small',
                onClick: saveHardwareDraftToLibrary
              })
            ]),
            h(Button, {
              label: t('common.cancel'),
              severity: 'secondary',
              text: true,
              size: 'small',
              onClick: () => { hardwareDialogVisible.value = false; }
            })
          ])
        ])),
        h(StandardDialog, {
          visible: foldedExpanded.value,
          'onUpdate:visible': value => { foldedExpanded.value = value; },
          header: t('cassette.v2.cassetteFoldedPreview'),
          size: 'xl',
          fill: true,
          showDefaultFooter: false
        }, () => [
          h('div', { class: 'h-[70vh] w-full' }, [foldedPreviewMount()])
        ]),

      ]);
    }
  });
}
