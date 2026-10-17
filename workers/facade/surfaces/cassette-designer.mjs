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
  collectCassetteV2ExpressionIdentifiers,
  renameCassetteV2TreeParameter,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  deleteCassetteV2WorkpieceRelation,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  isCassetteV2ProfileWorkpiece,
  OCCS_CASSETTE_FACE_ROLES,
  renderCassetteV2TreeToDrawing,
  cassetteV2LayerPanelRows,
  profileTerminalEdgesForTree,
  resolveCassetteV2AngleExpression,
  updateCassetteV2GraphNode,
  updateCassetteV2Workpiece,
  updateCassetteV2WorkpieceRelation
} from './lib/cassetteV2Renderer.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  closeOccsProfileSketchBoundary,
  createEmptyOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occProfileSketchLayerData,
  occsProfileFromSketch
} from '../occs/profiles.js';
import createExpressionEditor from './lib/components/expressionEditor.mjs';
import createFieldDraft from './lib/components/fieldDraft.mjs';
import createFoldedPreview from './lib/components/foldedPreview.mjs';
import createSketchEditor from './lib/components/sketchEditor.mjs';
import { buildCassetteV2FoldedPreview } from './lib/cassetteV2FoldedPreview.js';
import { normalizeGeometryDrawing } from './lib/drawingPreview.js';
import { hardwareDefaultParameters, hardwareLabel } from '../occs/hardware.js';

const OCCS_MIME = 'application/perigram+occs';

// §3 wire: records carry `name` — the label helper takes the plain
// candidates and falls back to the record id.
const entitySelectText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  }
  return '';
};
const entitySelectLabel = (entity, fallback = '') => entitySelectText(
  entity?.name, entity?.label, entity?.title,
  entity?.code, entity?._id, entity?.id, fallback
);
const entitySelectValue = (entity) => String(entity?._id || entity?.id || '');

// Snapshot undo/redo history, module-local (the editor owns its stack).
function snapshotHistory({ snapshot, apply, limit = 50 } = {}) {
  const state = { past: [], future: [], baseline: null, canUndo: false, canRedo: false };
  const gate = () => {
    state.canUndo = state.past.length > 0;
    state.canRedo = state.future.length > 0;
  };
  return {
    canUndo: { get value() { return state.canUndo; } },
    canRedo: { get value() { return state.canRedo; } },
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

export default function createSurface({ vue, components, locale, queries, records, notify, access }) {
  const { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;

  if (!queries || !records || !notify || !access) {
    throw new Error('cassette-designer requires the contract-2 mount context');
  }

  const CassetteExpressionEditor = createExpressionEditor({ vue, components, locale });
  const parameterNameDraft = createFieldDraft({ vue });
  const CassetteFoldedPreview = createFoldedPreview({ vue, components, locale });
  const ProfileSketchEditor = createSketchEditor({ vue, components, locale });
  const { DrawingCanvas, DesignerSurface, DesignerWorkspace, StandardDialog, Popover, Button, Checkbox, InputText, InputNumber, Message, ScrollPanel, Select, Tag } = components;

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
      const profileDialogVisible = ref(false);
      const editingProfileWorkpieceId = ref('');
      // Every dialog session drafts blank (owner decision 2026-10-17):
      // empty canvas, empty table — geometry and parameters are authored,
      // never seeded from the template.
      const profileDraft = ref({
        name: '',
        kind: 'hanger',
        process: 'extruded',
        parameters: {},
        sketch: createEmptyOccsProfileSketch(),
        occsProfile: null
      });
      const profileLibraryRecords = ref([]);
      const profileLibraryAvailable = ref(true);
      const profilePicker = ref(null);
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
        profileDraft.value.sketch || createEmptyOccsProfileSketch(),
        profileDraft.value.parameters || {}
      ));
      const profileDraftReady = computed(() => isOccsProfileSketchSavable(
        profileDraftSketch.value,
        // Global-bound fields read the cassette's variables — the save
        // gate resolves against them too.
        { ...(profileDraft.value.parameters || {}), ...globalParameters.value }
      ));
      const preparedProfileDraftSketch = computed(() => {
        const sketch = profileDraftSketch.value;
        return sketch.closed
          ? closeOccsProfileSketchBoundary(sketch, profileDraft.value.parameters || {})
          : sketch;
      });

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
      // Only parameters the profile's sketch actually references drive
      // its geometry — a numeric sketch (drawn or imported without
      // bindings) has none, and its workpiece row shows no dead chips.
      const profileBoundParameterKeys = (workpiece) => {
        const sketch = workpiece.profileSnapshot?.sketch || workpiece.profile?.sketch;
        if (!sketch) return new Set();
        const used = new Set();
        const collect = (value) => {
          if (typeof value !== 'string') return;
          try {
            collectCassetteV2ExpressionIdentifiers(value).forEach(identifier => used.add(identifier));
          } catch {
            // Half-authored values surface at evaluation; nothing binds.
          }
        };
        (sketch.points || []).forEach(point => { collect(point.x); collect(point.y); });
        (sketch.holes || []).forEach(hole => {
          (hole.center || []).forEach(collect);
          collect(hole.diameter);
        });
        (sketch.modifiers || []).forEach(modifier => collect(modifier.radius));
        Object.values(sketch.parameters || {}).forEach(collect);
        return used;
      };
      // Tree law (owner, 2026-10-17): every workpiece renders as a
      // top-level row — sheets and hardware never nest under each
      // other. Only profile workpieces nest, once, under the workpiece
      // their single attachment relation targets; every other relation
      // renders as a relation row under its workpiece.
      const nestedWorkpieceIds = computed(() => new Set(workpieces.value
        .filter(workpiece => isCassetteV2ProfileWorkpiece(workpiece)
          && workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length === 1)
        .map(workpiece => workpiece.id)));
      const workpieceRows = computed(() => workpieces.value.map(workpiece => ({
        id: workpiece.id,
        label: workpiece.name || workpiece.id,
        type: workpiece.type || 'sheet',
        family: workpiece.family || workpiece.hardware?.family || '',
        productionMode: workpiece.productionMode || workpiece.hardware?.productionMode || '',
        parameters: workpiece.parameters || workpiece.hardware?.parameters || {},
        boundParameterKeys: isCassetteV2ProfileWorkpiece(workpiece)
          ? profileBoundParameterKeys(workpiece)
          : null,
        isHardware: Boolean(workpiece.family || workpiece.hardware?.family),
        isProfile: isCassetteV2ProfileWorkpiece(workpiece),
        isNested: nestedWorkpieceIds.value.has(workpiece.id),
        parentCount: workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length,
        relations: workpieceRelationRowsById.value.get(workpiece.id) || []
      })));
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
      // Owner law (2026-10-16): a profile never arranges on a fold edge
      // (or one consumed by another profile) — the chooser offers only
      // the face's arrangeable edges, keeping the relation's own.
      // Hardware arrays may bind profile-occupied edges (owner law
      // 2026-10-17): the terminal exclusion is profile-on-profile only.
      const attachableEdgeOptions = (faceId, relationId, kind = 'profile') => cassetteV2AttachableProfileEdgesForTree(
        cassetteTree.value,
        faceId,
        relationId,
        { excludeProfileEdges: kind !== 'hardware' }
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
        event.preventDefault();
        event.stopPropagation();
        clearDesignerSelection();
      };

      const handleDesignerKeydown = (event) => {
        if (isScopedKeyboardTarget(event.target)) return;
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
        const dto = known || await queries.get('cassette', key).catch(() => null);
        if (!dto) return;
        const hydrated = await hydrateDefinition(dto);
        persistedTemplateIdOverride.value = hydrated._id?.toString() || '';
        loadedDocument.value = hydrated;
        applyTemplate(hydrated);
      };

      const saveTemplate = async ({ saveAs = false } = {}) => {
        const tree = JSON.parse(JSON.stringify(cassetteTree.value));
        const definition = createCassetteV2OccsDocument(tree, cassetteMarkContext.value);
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
        queries.list('cassette').then(rows => {
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
            relationId,
            // Hardware arrays may sit on profile-occupied edges (owner
            // law 2026-10-17): only profile askers get the exclusion.
            { excludeProfileEdges: attachmentSourceKind(relation) !== 'hardware' }
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
        const data = {
          kind: profileDraft.value.kind,
          process: profileDraft.value.process,
          parameters: sketch.parameters,
          sketch,
          // The derived profile resolves global-bound fields against the
          // cassette's variables; the stored sketch keeps the clean
          // table.
          occsProfile: occsProfileFromSketch(sketch, { parameters: globalParameters.value })
        };
        return {
          name: profileDraft.value.name || t('cassette.v2.profileEditor.defaultName'),
          ...data
        };
      };

      const openProfileDialog = (workpieceId = '') => {
        closeInlineEditor();
        editingProfileWorkpieceId.value = workpieceId;
        const workpiece = workpieces.value.find(item => item.id === workpieceId) || null;
        if (workpiece) {
          const profile = workpiece.profileSnapshot || workpiece.profile || null;
          profileDraft.value = {
            name: workpiece.name || t('cassette.v2.profileEditor.defaultName'),
            kind: workpiece.role || profile?.kind || 'hanger',
            process: workpiece.process || profile?.process || 'extruded',
            parameters: workpiece.parameters || profile?.parameters || {},
            sketch: profile?.sketch || createEmptyOccsProfileSketch(),
            occsProfile: profile?.section ? { section: profile.section, sweep: profile.sweep, sketch: profile.sketch } : profile?.occsProfile || null,
            libraryId: workpiece.profileTemplateId?.toString() || ''
          };
        } else {
          // Blank draft (owner decision 2026-10-17): the dialog opens on
          // an empty canvas and an empty table, never the seeded template.
          profileDraft.value = {
            name: t('cassette.v2.profileEditor.defaultName'),
            kind: 'hanger',
            process: 'extruded',
            parameters: {},
            sketch: createEmptyOccsProfileSketch(),
            occsProfile: null,
            libraryId: ''
          };
        }
        profileDialogVisible.value = true;
        loadProfileLibrary();
      };

      // The profile library: `profile` records of the plugin's own type,
      // authored only from this dialog. Save to library writes the
      // authored truth (kind, process, prepared sketch) through the
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
        const sketch = normalizeOccsProfileSketch(
          record?.fields?.sketch || createEmptyOccsProfileSketch(),
          {}
        );
        profileDraft.value = {
          name: record.name || t('cassette.v2.profileEditor.defaultName'),
          kind: record?.fields?.kind || 'hanger',
          process: record?.fields?.process || 'extruded',
          parameters: { ...(sketch.parameters || {}) },
          sketch,
          occsProfile: null,
          libraryId: record?._id?.toString() || ''
        };
      };

      // The add-profile picker: library rows with evaluated-sketch
      // thumbnails beside Create new (the blank dialog draft). Picking a
      // row places the profile as a workpiece directly — a snapshot copy
      // of the record's authored truth; the dialog stays the authoring
      // surface.
      const openProfilePicker = (event) => {
        loadProfileLibrary();
        profilePicker.value?.toggle?.(event);
      };

      const closeProfilePicker = () => {
        profilePicker.value?.hide?.();
      };

      const profileRecordThumbnail = (record) => {
        const layerData = occProfileSketchLayerData(record?.fields?.sketch);
        return layerData ? normalizeGeometryDrawing({ data: { layerData } }) : null;
      };

      const addProfileFromLibrary = (record) => {
        if (!record) return;
        const sketch = normalizeOccsProfileSketch(
          record?.fields?.sketch || createEmptyOccsProfileSketch(),
          {}
        );
        let occsProfile = null;
        try {
          occsProfile = occsProfileFromSketch(sketch, {});
        } catch {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        const added = addCassetteV2ProfileWorkpiece(cassetteTree.value, {
          referenceWorkpieceId: selectedWorkpieceId.value,
          name: record.name || t('cassette.v2.profileEditor.defaultName'),
          kind: record?.fields?.kind || 'hanger',
          process: record?.fields?.process || 'extruded',
          parameters: { ...(sketch.parameters || {}) },
          occsProfile,
          sketch,
          // Library provenance: edits stay local (the snapshot law), and
          // Update library targets this record.
          profileTemplateId: record?._id?.toString() || ''
        });
        cassetteTree.value = added.tree;
        selectWorkpiece(added.workpieceId);
        closeProfilePicker();
      };

      const saveProfileDraftToLibrary = async () => {
        if (!profileDraftReady.value) {
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
          if (created) profileLibraryRecords.value = [created, ...profileLibraryRecords.value];
          notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.savedToLibrary'), life: 2500 });
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
      // Update library is the explicit rewrite of the origin record —
      // authored truth only (kind, process, prepared sketch), the
      // record keeps its name.
      const updateProfileLibraryRecord = async () => {
        const libraryId = profileDraft.value.libraryId;
        if (!profileDraftReady.value || !libraryId) {
          if (!profileDraftReady.value) {
            notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          }
          return;
        }
        const payload = profileDraftPayload();
        try {
          const updated = await records.update('profile', libraryId, {
            fields: {
              kind: payload.kind,
              process: payload.process,
              sketch: payload.sketch
            }
          });
          if (updated) {
            profileLibraryRecords.value = profileLibraryRecords.value.map(item =>
              item?._id?.toString() === libraryId ? updated : item);
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

      // Profiles persist as tree workpieces (the workpiece's
      // profileSnapshot is the renderer's geometry source) and ride the
      // cassette template's own save.
      const saveProfileDraft = () => {
        if (!profileDraftReady.value) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return;
        }
        const payload = profileDraftPayload();
        const workpieceId = editingProfileWorkpieceId.value;
        if (workpieceId && workpieces.value.some(item => item.id === workpieceId)) {
          cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, workpieceId, {
            name: payload.name,
            role: payload.kind,
            process: payload.process,
            parameters: payload.parameters,
            profileSnapshot: {
              kind: payload.kind,
              process: payload.process,
              parameters: payload.parameters,
              sketch: payload.sketch,
              section: payload.occsProfile.section,
              sweep: payload.occsProfile.sweep
            }
          });
        } else {
          const added = addCassetteV2ProfileWorkpiece(cassetteTree.value, {
            referenceWorkpieceId: selectedWorkpieceId.value,
            name: payload.name,
            kind: payload.kind,
            process: payload.process,
            parameters: payload.parameters,
            occsProfile: payload.occsProfile,
            sketch: payload.sketch
          });
          cassetteTree.value = added.tree;
          selectWorkpiece(added.workpieceId);
        }
        profileDialogVisible.value = false;
        notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.saved'), life: 2500 });
      };

      const updateSelectedHardware = (patch) => {
        if (!selectedWorkpiece.value) return;
        cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, selectedWorkpiece.value.id, patch);
      };

      // Instance parameters re-evaluate the profile snapshot from its
      // sketch — this is parametric instantiation on the workpiece row.
      const updateProfileWorkpieceParameter = (workpieceId, key, value) => {
        const workpiece = workpieces.value.find(item => item.id === workpieceId);
        if (!workpiece) return;
        cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, workpieceId, {
          parameters: { ...(workpiece.parameters || {}), [key]: value }
        });
      };

      // A parameter field is the shared expression editor over the
      // cassette's variables (the same component every expression field
      // rides): its value may name a global and reads it live.
      const profileParameterField = (row, key, value) => h(CassetteExpressionEditor, {
        modelValue: value,
        parameters: globalParameters.value,
        parameterNames: globalParameterNames.value,
        'aria-label': `${t('cassette.v2.profileEditor.parameters')} ${key} ${row.label}`,
        'onUpdate:modelValue': next => {
          updateProfileWorkpieceParameter(row.id, key, next);
        }
      });

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

      const addFaceAtEdge = (parentId, edgeIndex) => {
        if (!parentId && parentId !== '') return;
        // A profile-arranged edge is terminal: the profile consumes the
        // edge and the face ends there — nothing grows from it.
        if (profileTerminalEdgesForTree(cassetteTree.value).has(`${parentId}:${Math.max(0, Math.round(Number(edgeIndex) || 0))}`)) return;
        const result = addCassetteV2GraphChild(cassetteTree.value, parentId, edgeIndex);
        cassetteTree.value = result.tree;
        selectedNodeId.value = result.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
      };

      const handleDesignerAction = ({ edge, edgeIndex }) => {
        if (!edge?.nodeId && edge?.nodeId !== '') return;
        addFaceAtEdge(edge.nodeId, edge.edgeIndex ?? edgeIndex);
      };

      const handleDesignerFaceSelect = ({ face }) => {
        if (!face?.nodeId && face?.nodeId !== '') return;
        if (inspectorSelection.value === 'attachment' && selectedWorkpieceRelation.value) {
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
          h('small', { class: 'uppercase text-muted text-supporting' }, t('cassette.v2.globalParameters')),
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
        h('small', { class: 'uppercase text-muted text-supporting' }, t('common.layers')),
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
          // Caption blocks, not <label>s: a label wraps exactly one
          // control, and the editor's token panel carries buttons —
          // the browser forwards a click on the label to its first
          // button, typing phantom tokens into the field.
          const expressionField = (labelKey, value, key) => h('div', {
            class: 'flex min-w-0 flex-col gap-1 text-muted text-label',
            title: t(labelKey)
          }, [
            h('span', { class: 'truncate' }, t(labelKey)),
            h(CassetteExpressionEditor, {
              modelValue: value,
              parameters: globalParameters.value,
              parameterNames: globalParameterNames.value,
              'onUpdate:modelValue': next => updateInlineAttachmentRelation({ [key]: next })
            })
          ]);
          const selectField = (labelKey, modelValue, options, key) => h(Select, {
            modelValue,
            options: options.value,
            optionLabel: 'label',
            optionValue: 'value',
            class: 'w-full',
            size: 'small',
            'aria-label': t(labelKey),
            title: t(labelKey),
            'onUpdate:modelValue': value => updateInlineAttachmentRelation({ [key]: value })
          });
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
                expressionField('cassette.v2.attachmentFields.normalOffset', relation.sourceOffsetY, 'sourceOffsetY')
              ])
            ]);
          } else {
            body = h('div', { class: 'flex w-96 flex-col gap-2' }, [
              dragHandle([
                h(Select, {
                  modelValue: relation.targetFaceId,
                  options: targetFaceOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  class: 'min-w-0 flex-1',
                  size: 'small',
                  'aria-label': t('cassette.v2.attachmentFields.targetFace'),
                  title: t('cassette.v2.attachmentFields.targetFace'),
                  onMousedown: event => event.stopPropagation(),
                  'onUpdate:modelValue': value => updateInlineAttachmentRelation({ targetFaceId: value })
                })
              ]),
              h('div', { class: 'grid grid-cols-2 gap-2' }, [
                selectField('cassette.v2.attachmentFields.targetSnap', relation.targetSnap, snapOptions, 'targetSnap'),
                expressionField('cassette.v2.attachmentFields.edgeMargin', relation.offsetX, 'offsetX'),
                expressionField('cassette.v2.attachmentFields.normalOffset', relation.offsetY, 'offsetY'),
                expressionField('cassette.v2.attachmentFields.rotation', relation.rotation, 'rotation'),
                kind === 'hardware'
                  ? selectField('cassette.v2.attachmentFields.side', relation.targetSide, sideOptions, 'targetSide')
                  : null,
                selectField('cassette.v2.attachmentFields.placementMode', relation.placementMode, placementModeOptions, 'placementMode'),
                relation.placementMode === 'edgeArray'
                  ? h(Select, {
                      modelValue: relation.arrayEdge,
                      options: attachableEdgeOptions(relation.targetFaceId, relation.id, kind),
                      optionLabel: 'label',
                      optionValue: 'value',
                      class: 'w-full',
                      size: 'small',
                      'aria-label': t('cassette.v2.attachmentFields.arrayEdge'),
                      title: t('cassette.v2.attachmentFields.arrayEdge'),
                      'onUpdate:modelValue': value => updateInlineAttachmentRelation({ placementMode: 'edgeArray', arrayEdge: value })
                    })
                  : null,
                relation.placementMode === 'edgeArray'
                  ? selectField('cassette.v2.attachmentFields.arrayMode', relation.arrayMode, arrayModeOptions, 'arrayMode')
                  : null,
                relation.placementMode === 'edgeArray'
                  ? h('div', { class: 'flex min-w-0 flex-col gap-1 text-muted text-label', title: arrayValueLabel(relation) }, [
                      h('span', { class: 'truncate' }, arrayValueLabel(relation)),
                      h(CassetteExpressionEditor, {
                        modelValue: arrayValue(relation),
                        parameters: globalParameters.value,
                        parameterNames: globalParameterNames.value,
                        'onUpdate:modelValue': value => updateInlineAttachmentRelation(arrayValuePatch(relation, value))
                      })
                    ])
                  : null,
                kind === 'profile'
                  ? h('div', { class: 'flex min-w-0 gap-1' }, [
                      h(Button, {
                        icon: 'pi pi-arrows-h',
                        severity: relation.mirrorX ? 'primary' : 'secondary',
                        size: 'small',
                        class: 'min-w-0 flex-1',
                        label: t('cassette.v2.attachmentFields.mirrorX'),
                        'aria-label': t('cassette.v2.attachmentFields.mirrorX'),
                        title: t('cassette.v2.attachmentFields.mirrorX'),
                        onClick: () => updateInlineAttachmentRelation({ mirrorX: !relation.mirrorX })
                      }),
                      h(Button, {
                        icon: 'pi pi-arrows-v',
                        severity: relation.mirrorY ? 'primary' : 'secondary',
                        size: 'small',
                        class: 'min-w-0 flex-1',
                        label: t('cassette.v2.attachmentFields.mirrorY'),
                        'aria-label': t('cassette.v2.attachmentFields.mirrorY'),
                        title: t('cassette.v2.attachmentFields.mirrorY'),
                        onClick: () => updateInlineAttachmentRelation({ mirrorY: !relation.mirrorY })
                      })
                    ])
                  : null
              ])
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
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
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

      // The bound parameters lay out as captioned expression fields in
      // the palette's field grid — the attachment popup's caption
      // pattern, never bespoke chip chrome.
      const workpieceDetailBlocks = (row) => [
        row.id === selectedWorkpieceId.value && row.isProfile
          ? h('div', { class: 'mt-2 grid grid-cols-2 gap-2 pl-4' },
              Object.entries(row.parameters || {})
                .filter(([key]) => row.boundParameterKeys?.has(key))
                .map(([key, value]) => h('div', {
                  key: `${row.id}-${key}`,
                  class: 'flex min-w-0 flex-col gap-1 text-muted text-label'
                }, [
                  h('span', { class: 'truncate' }, key),
                  profileParameterField(row, key, value)
                ])))
          : null,
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
              onClick: () => selectWorkpieceForInspector(dependent.id)
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
              dependent.isProfile
                ? h(Button, {
                    icon: 'pi pi-pencil',
                    severity: 'secondary',
                    text: true,
                    rounded: true,
                    size: 'small',
                    'aria-label': t('cassette.v2.editProfile'),
                    title: t('cassette.v2.editProfile'),
                    onClick: () => openProfileDialog(dependent.id)
                  })
                : null,
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
      ]);

      const renderInspector = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' }, [
          h('div', { class: 'flex items-center justify-between gap-2' }, [
            h('strong', { class: 'truncate' }, t('cassette.v2.workpieces')),
            h('div', { class: 'flex items-center gap-1' }, [
              h(Tag, { value: assemblySummary.value, severity: 'secondary', size: 'small' }),
              h(Button, {
                icon: 'pi pi-wave-pulse',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('cassette.v2.addProfile'),
                title: t('cassette.v2.addProfile'),
                onClick: event => openProfilePicker(event)
              }),
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
                      onClick: () => selectWorkpieceForInspector(row.id)
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
                          row.isProfile
                            ? h(Button, {
                                icon: 'pi pi-pencil',
                                severity: 'secondary',
                                text: true,
                                rounded: true,
                                size: 'small',
                                'aria-label': t('cassette.v2.editProfile'),
                                title: t('cassette.v2.editProfile'),
                                onClick: () => openProfileDialog(row.id)
                              })
                            : null,
                          row.id !== workpieces.value[0]?.id
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
      // the same tree renderer the bound preview surface uses — the
      // preview layer set is outline and folds, nothing else. Thumbnails
      // cache by record id + updatedAt.
      const templateThumbnails = ref(new Map());
      const PREVIEW_LAYERS = ['cut.outer', 'fold.route'];

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
          const present = new Set((drawing?.layers || []).map(layer => layer.name));
          templateThumbnails.value.set(key, {
            drawing,
            visibleLayerNames: PREVIEW_LAYERS.filter(name => present.has(name))
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
        renderOnboardingRail(),
        h(DesignerWorkspace, {
          layout: 'lanes',
          class: 'min-h-0 flex-1',
          documentItems: documentDockItems.value,
          canvasItems: canvasDockItems.value
        }, {
          palette: renderPalette,
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
              designerSelectableWorkpieceIds: designerSelectableWorkpieceIds.value,
              showDesignerWorkpieceContext: showDesignerWorkpieceContext.value,
              onReady: handleDrawingReady,
              onLayerToggle: updateVisibleLayerNames,
              onDesignerAction: handleDesignerAction,
              onDesignerFaceSelect: handleDesignerFaceSelect,
              onDesignerFoldSelect: handleDesignerFoldSelect,
              onDesignerFaceCommand: handleDesignerFaceCommand,
              onDesignerPointEdit: handleDesignerPointEdit,
              onDesignerSectionEdit: handleDesignerSectionEdit,
              onDesignerFoldAngleEdit: handleDesignerFoldAngleEdit
            }),
            renderInlineEditor()
          ]),
          inspector: renderInspector
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
                  'aria-label': t('common.rename')
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
                      h('span', { class: 'truncate' }, record?.name || record?._id)
                    ]);
                  }))
              : null,
            dockPopoverPanel.value === 'rename'
              ? h(Button, {
                  icon: 'pi pi-check',
                  label: t('common.save'),
                  size: 'small',
                  onClick: () => closeDockPopover()
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
              openProfileDialog();
            }
          }),
          profileLibraryAvailable.value && profileLibraryRecords.value.length
            ? h('div', { class: 'mt-1 flex flex-col border-t border-content-border pt-1' },
                profileLibraryRecords.value.map(record => {
                  const thumbnail = profileRecordThumbnail(record);
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
        h(StandardDialog, {
          visible: profileDialogVisible.value,
          'onUpdate:visible': value => { profileDialogVisible.value = value; },
          header: t('cassette.v2.profileEditor.title'),
          size: 'xl',
          fill: true,
          showDefaultFooter: false,
          // Near-viewport height (owner decision 2026-10-17): the editor
          // canvas takes the space; `fill` keeps the viewport caps.
          class: 'h-[92dvh]'
        }, {
          // Window-level controls in one compact row (owner decision
          // 2026-10-17): identity, kind/process, library pick, and the
          // save actions; the dialog's header close cancels.
          default: () => h('div', { class: 'flex min-h-0 flex-1 flex-col gap-2' }, [
            h('div', { class: 'flex shrink-0 flex-wrap items-center gap-2' }, [
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
                ? h(Select, {
                  modelValue: null,
                  options: profileLibraryRecords.value,
                  optionLabel: 'name',
                  placeholder: t('cassette.v2.profileEditor.library'),
                  appendTo: 'self',
                  size: 'small',
                  class: 'w-44',
                  'onUpdate:modelValue': value => { applyProfileLibraryRecord(value); }
                })
                : null,
              h(Button, {
                icon: 'pi pi-save',
                severity: 'primary',
                rounded: true,
                size: 'small',
                disabled: !profileDraftReady.value,
                'aria-label': t('common.save'),
                title: t('common.save'),
                onClick: saveProfileDraft
              }),
              profileLibraryAvailable.value
                ? h(Button, {
                  icon: profileDraft.value.libraryId ? 'pi pi-cloud-upload' : 'pi pi-bookmark',
                  severity: 'secondary',
                  text: true,
                  rounded: true,
                  size: 'small',
                  disabled: !profileDraftReady.value,
                  'aria-label': profileDraft.value.libraryId
                    ? t('cassette.v2.profileEditor.updateLibrary')
                    : t('cassette.v2.profileEditor.saveToLibrary'),
                  title: profileDraft.value.libraryId
                    ? t('cassette.v2.profileEditor.updateLibrary')
                    : t('cassette.v2.profileEditor.saveToLibrary'),
                  onClick: profileDraft.value.libraryId ? updateProfileLibraryRecord : saveProfileDraftToLibrary
                })
                : null
            ]),
            h(ProfileSketchEditor, {
              modelValue: profileDraft.value.sketch,
              externalParameters: globalParameters.value,
              'onUpdate:modelValue': value => { profileDraft.value.sketch = value; },
              onProfile: value => { profileDraft.value.occsProfile = value; }
            })
          ])
        })
      ]);
    }
  });
}
