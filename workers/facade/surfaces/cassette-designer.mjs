// The facade plugin's cassette designer surface (surface contract 2).
// The mounted module receives the cassette record and the generic
// persistence callbacks; templates and profile templates ride the
// cross-type query/record transports; the OCCS engine and the render
// family are the plugin's own lib. The three.js folded-preview runtime
// is vendored beside the plugin.
import {
  addCassetteV2GraphChild,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2WorkpieceAttachment,
  addCassetteV2Workpiece,
  CASSETTE_V2_HANGER_PRODUCTION_MODES,
  CASSETTE_V2_HARDWARE_FAMILIES,
  collectCassetteV2ExpressionIdentifiers,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  deleteCassetteV2WorkpieceRelation,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  OCCS_CASSETTE_FACE_ROLES,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  updateCassetteV2GraphNode,
  updateCassetteV2Workpiece,
  updateCassetteV2WorkpieceRelation
} from './lib/cassetteV2Renderer.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  closeOccsProfileSketchBoundary,
  createDefaultOccsProfileTemplateData,
  createEmptyOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '../occs/profiles.js';
import createExpressionEditor from './lib/components/expressionEditor.mjs';
import createFoldedPreview from './lib/components/foldedPreview.mjs';
import createSketchEditor from './lib/components/sketchEditor.mjs';
import { buildCassetteV2FoldedPreview } from './lib/cassetteV2FoldedPreview.js';

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
  const CassetteFoldedPreview = createFoldedPreview({ vue, components, locale });
  const ProfileSketchEditor = createSketchEditor({ vue, components, locale });
  const { DrawingCanvas, DesignerSurface, DesignerWorkspace, StandardDialog, Popover, InstanceSelect, Button, Checkbox, InputText, Message, ScrollPanel, Select, Tag, Textarea } = components;

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
      const pendingAttachmentSourceId = ref('');
      const foldedPreviewWorkpieceId = ref('');
      const previewSource = ref(null);
      const cassettePreviewSource = ref(null);
      const previewError = ref('');
      const occsDialogVisible = ref(false);
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

      const profileTemplateItems = ref([]);
      const refreshProfileTemplates = async () => {
        profileTemplateItems.value = await queries
          .list('profileTemplate', profileTemplateListFilters())
          .catch(() => profileTemplateItems.value) || [];
      };

      function openDockPopover(panel, event) {
        dockPopoverPanel.value = panel;
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
        },
        {
          icon: 'pi pi-code',
          label: t('cassette.v2.occsDraft'),
          onClick: () => { occsDialogVisible.value = true; }
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
      const profileDialogVisible = ref(false);
      const profileSaving = ref(false);
      const selectedProfileTemplateId = ref('');
      const editingProfileWorkpieceId = ref('');
      const profileDraft = ref({
        name: '',
        ...createDefaultOccsProfileTemplateData({ sketch: createEmptyOccsProfileSketch() })
      });
      const templateRecords = ref([]);
      const loadedDocument = ref(null);

      const profileDraftSketch = computed(() => normalizeOccsProfileSketch(
        profileDraft.value.sketch || createEmptyOccsProfileSketch(),
        profileDraft.value.parameters || {}
      ));
      const profileDraftReady = computed(() => isOccsProfileSketchSavable(
        profileDraftSketch.value, profileDraft.value.parameters || {}
      ));
      const preparedProfileDraftSketch = computed(() => closeOccsProfileSketchBoundary(
        profileDraftSketch.value, profileDraft.value.parameters || {}
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
      const assemblySummary = computed(() => `${workpieces.value.length}/${workpieceRelations.value.length}`);
      const workpieceLabel = (workpieceId) => {
        const workpiece = workpieceById.value.get(workpieceId);
        return workpiece?.name || workpieceId || '';
      };
      const workpieceRelationRowsById = computed(() => {
        const rows = new Map(workpieces.value.map(workpiece => [workpiece.id, []]));
        for (const relation of workpieceRelations.value) {
          const status = relationDiagnosticsById.value.get(relation.id)?.status || 'ok';
          if (relation.sourceWorkpieceId) {
            rows.get(relation.sourceWorkpieceId)?.push({
              relation,
              direction: 'out',
              arrow: '->',
              otherLabel: workpieceLabel(relation.targetWorkpieceId),
              faceLabel: `${relation.sourceFaceId} -> ${relation.targetFaceId}`,
              status
            });
          }
          if (relation.targetWorkpieceId) {
            rows.get(relation.targetWorkpieceId)?.push({
              relation,
              direction: 'in',
              arrow: '<-',
              otherLabel: workpieceLabel(relation.sourceWorkpieceId),
              faceLabel: `${relation.targetFaceId} <- ${relation.sourceFaceId}`,
              status
            });
          }
        }
        return rows;
      });
      const workpieceRows = computed(() => workpieces.value.map(workpiece => ({
        id: workpiece.id,
        label: workpiece.name || workpiece.id,
        type: workpiece.type || 'sheet',
        family: workpiece.family || workpiece.hardware?.family || '',
        productionMode: workpiece.productionMode || workpiece.hardware?.productionMode || '',
        profileTemplateId: workpiece.profileTemplateId || workpiece.hardware?.profileTemplateId || '',
        parameters: workpiece.parameters || workpiece.hardware?.parameters || {},
        isHardware: Boolean(workpiece.family || workpiece.hardware?.family),
        isProfile: workpiece.type === 'profile' || Boolean(workpiece.profileSnapshot || workpiece.profile),
        parentCount: workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length,
        relations: workpieceRelationRowsById.value.get(workpiece.id) || []
      })));
      const relationStatusSeverity = (status) => {
        if (status === 'impossible') return 'danger';
        if (status === 'unresolved') return 'warn';
        return 'secondary';
      };
      const hueForWorkpiece = (workpieceId = '') => {
        let hash = 0;
        for (const char of String(workpieceId || 'workpiece')) {
          hash = (hash * 31 + char.charCodeAt(0)) % 360;
        }
        return (hash * 137 + 43) % 360;
      };
      const workpieceAccentStyle = (workpieceId) => ({
        backgroundColor: `hsl(${hueForWorkpiece(workpieceId)} 68% 52%)`
      });
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
      const jointTypeOptions = computed(() => ['mechanical', 'adhesive', 'weld', 'interlock', 'hook_on', 'sealed', 'gasketed', 'other'].map(type => ({
        label: t(`cassette.v2.jointTypes.${type}`),
        value: type
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
      const profileTemplateOptions = computed(() => profileTemplateItems.value.map(profile => ({
        label: entitySelectLabel(profile, t('cassette.v2.profileEditor.defaultName')),
        value: entitySelectValue(profile),
        entity: profile
      })).filter(option => option.value));
      const profileTemplateListFilters = () => ({
        ...(selectedTemplateId.value ? { cassetteTemplateId: selectedTemplateId.value } : {})
      });
      const editableProfileTemplateId = (profile = null) => (
        profile?.lineage?.userId || profile?.lineage?.organizationId ? profile._id : ''
      );
      const ensureProfileTemplatesLoaded = async () => {
        if (!profileTemplateItems.value.length) {
          await refreshProfileTemplates();
        }
      };
      const upsertProfileTemplateItem = (profile = null) => {
        if (!profile?._id) return;
        const nextItems = [...profileTemplateItems.value];
        const index = nextItems.findIndex(item => String(item?._id || '') === String(profile._id));
        if (index >= 0) nextItems[index] = profile;
        else nextItems.unshift(profile);
        profileTemplateItems.value = nextItems;
      };
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
      const edgeOptions = computed(() => [0, 1, 2, 3].map(index => ({
        label: `E${index}`,
        value: `E${index}`
      })));
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
      const drawingCanvasSource = computed(() => {
        if (!previewSource.value || inspectorSelection.value !== 'attachment') return previewSource.value;
        return { ...previewSource.value, designerEdges: [] };
      });
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
      const occsJson = computed(() => JSON.stringify(createCassetteV2OccsDocument(cassetteTree.value, cassetteMarkContext.value), null, 2));
      const drawingLayerNames = computed(() => drawingLayers.value.map(layer => layer.name).filter(Boolean));
      const sameEntityId = (left, right) => left?.toString?.() === right?.toString?.();
      const standardCodeOf = (standard) => standard?.fields?.code || null;
      const layerRows = computed(() => drawingLayers.value.map(layer => {
        const standard = standards.value.find(item => (
          sameEntityId(item._id, layer.standardId) ||
          (layer.standardCode && standardCodeOf(item) === layer.standardCode)
        )) || null;
        const pen = pens.value.find(item => sameEntityId(item._id, layer.penId)) || null;
        return { key: layer.name, layer, standard, pen };
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
        pendingAttachmentSourceId.value = '';
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
      // list for the open dock rides the query transport.
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
        queries.list('cassette').then(rows => { templateRecords.value = rows || []; }).catch(() => {});
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

      const layerInputId = (layer) => `cassette-v2-layer-${String(layer.name).replace(/[^A-Za-z0-9_-]/g, '-')}`;

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
        const point = event
          ? { x: event.clientX, y: event.clientY }
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
        cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, relationId, patch);
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

      const deleteInlineAttachmentRelation = () => {
        deleteWorkpieceRelation(inlineEditorRelation.value?.id || selectedWorkpieceRelation.value?.id);
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

      const addHardwareToSelectedWorkpiece = () => {
        closeInlineEditor();
        const selectedIsHardware = Boolean(selectedWorkpiece.value?.family || selectedWorkpiece.value?.hardware?.family);
        const parentRelation = selectedIsHardware
          ? workpieceRelations.value.find(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value)
          : null;
        const referenceWorkpieceId = parentRelation?.targetWorkpieceId || selectedWorkpieceId.value || workpieces.value[0]?.id;
        const referenceNodeId = selectedNode.value?.workpieceId === referenceWorkpieceId
          ? selectedNode.value.id
          : treeNodes.value.find(node => node.workpieceId === referenceWorkpieceId && !node.parentId)?.id;
        const result = addCassetteV2HardwareWorkpiece(cassetteTree.value, {
          referenceWorkpieceId,
          referenceNodeId,
          family: 'hanger_clip',
          productionMode: 'integralCut'
        });
        cassetteTree.value = result.tree;
        selectedWorkpieceOverrideId.value = result.workpieceId;
        selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
          .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
        inspectorSelection.value = 'attachment';
      };

      const profileDraftPayload = () => {
        const sketch = preparedProfileDraftSketch.value;
        const data = {
          kind: profileDraft.value.kind,
          process: profileDraft.value.process,
          parameters: sketch.parameters || profileDraft.value.parameters || {},
          sketch,
          occsProfile: occsProfileFromSketch(sketch)
        };
        return {
          name: profileDraft.value.name || t('cassette.v2.profileEditor.defaultName'),
          cassetteTemplateId: selectedTemplateId.value || '',
          ...data
        };
      };

      const loadProfileTemplateDraft = (profileId) => {
        const profile = profileTemplateItems.value.find(item => String(item._id || '') === String(profileId || ''));
        if (!profile) return;
        profileDraft.value = {
          _id: editableProfileTemplateId(profile),
          name: profile.name || '',
          kind: profile.fields?.kind || 'hanger',
          process: profile.fields?.process || 'extruded',
          parameters: profile.fields?.parameters || {},
          sketch: profile.fields?.sketch || createDefaultOccsProfileTemplateData().sketch,
          occsProfile: profile.fields?.occsProfile || null
        };
      };

      const openProfileDialog = async (workpieceId = '') => {
        closeInlineEditor();
        editingProfileWorkpieceId.value = workpieceId;
        if (!profileTemplateItems.value.length) {
          await refreshProfileTemplates();
        }
        const workpiece = workpieces.value.find(item => item.id === workpieceId) || null;
        if (workpiece) {
          const profile = workpiece.profileSnapshot || workpiece.profile || createDefaultOccsProfileTemplateData();
          const sourceTemplate = profileTemplateItems.value.find(item => String(item._id || '') === String(workpiece.profileTemplateId || ''));
          selectedProfileTemplateId.value = workpiece.profileTemplateId || '';
          profileDraft.value = {
            _id: editableProfileTemplateId(sourceTemplate),
            name: workpiece.name || t('cassette.v2.profileEditor.defaultName'),
            kind: workpiece.role || profile.kind || 'hanger',
            process: workpiece.process || profile.process || 'extruded',
            parameters: workpiece.parameters || profile.parameters || {},
            sketch: profile.sketch || createDefaultOccsProfileTemplateData().sketch,
            occsProfile: profile.section ? { section: profile.section, sweep: profile.sweep, sketch: profile.sketch } : profile.occsProfile || null
          };
        } else {
          selectedProfileTemplateId.value = '';
          profileDraft.value = {
            name: t('cassette.v2.profileEditor.defaultName'),
            ...createDefaultOccsProfileTemplateData({ sketch: createEmptyOccsProfileSketch() })
          };
        }
        profileDialogVisible.value = true;
      };

      const saveProfileDraft = async () => {
        if (!profileDraftReady.value) {
          notify({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
          return null;
        }
        profileSaving.value = true;
        try {
          const payload = profileDraftPayload();
          const saved = profileDraft.value._id
            ? await records.update('profileTemplate', profileDraft.value._id, payload)
            : await records.create('profileTemplate', payload);
          selectedProfileTemplateId.value = saved?._id || selectedProfileTemplateId.value;
          profileDraft.value._id = saved?._id || profileDraft.value._id;
          upsertProfileTemplateItem(saved);
          await refreshProfileTemplates();
          upsertProfileTemplateItem(saved);
          notify({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.saved'), life: 2500 });
          return saved;
        } catch (error) {
          const detail = error?.data?.message || error?.message || t('cassette.v2.profileEditor.saveFailed');
          notify({ severity: 'error', summary: t('common.error'), detail, life: 5000 });
          return null;
        } finally {
          profileSaving.value = false;
        }
      };

      const updateSelectedHardware = (patch) => {
        if (!selectedWorkpiece.value) return;
        cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, selectedWorkpiece.value.id, patch);
      };

      const updateSelectedHardwareProfile = (profileId) => {
        const profile = profileTemplateItems.value.find(item => String(item._id || '') === String(profileId || ''));
        updateSelectedHardware({
          profileTemplateId: profile?._id || '',
          profileSnapshot: profile?.data || null
        });
      };

      const addAttachmentToWorkpiece = (workpieceId, targetWorkpieceId = '') => {
        closeInlineEditor();
        const targetWorkpiece = workpieces.value.find(workpiece => (
          workpiece.id === targetWorkpieceId &&
          workpiece.id !== workpieceId
        )) || workpieces.value.find(workpiece => workpiece.id !== workpieceId);
        if (!targetWorkpiece) return;
        const sourceFaceId = selectedNode.value?.workpieceId === workpieceId
          ? selectedNode.value.id
          : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId)?.id;
        const result = addCassetteV2WorkpieceAttachment(cassetteTree.value, workpieceId, {
          targetWorkpieceId: targetWorkpiece.id,
          targetFaceId: targetWorkpiece.rootId,
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

      const startAttachmentConnect = (workpieceId) => {
        pendingAttachmentSourceId.value = pendingAttachmentSourceId.value === workpieceId ? '' : workpieceId;
        selectWorkpieceForInspector(workpieceId);
      };

      const handleWorkpieceGraphNodeSelect = (workpieceId) => {
        if (pendingAttachmentSourceId.value && pendingAttachmentSourceId.value !== workpieceId) {
          addAttachmentToWorkpiece(pendingAttachmentSourceId.value, workpieceId);
          pendingAttachmentSourceId.value = '';
          return;
        }
        selectWorkpieceForInspector(workpieceId);
      };

      const deleteWorkpiece = (workpieceId) => {
        closeInlineEditor();
        const result = deleteCassetteV2Workpiece(cassetteTree.value, workpieceId);
        if (!result.deletedWorkpieceIds.length) return;
        cassetteTree.value = result.tree;
        if (result.deletedWorkpieceIds.includes(foldedPreviewWorkpieceId.value)) {
          foldedPreviewWorkpieceId.value = '';
        }
        if (result.deletedWorkpieceIds.includes(pendingAttachmentSourceId.value)) {
          pendingAttachmentSourceId.value = '';
        }
        if (result.deletedWorkpieceIds.includes(selectedWorkpieceOverrideId.value)) {
          selectedWorkpieceOverrideId.value = '';
        }
        selectedRelationId.value = '';
        selectWorkpieceForInspector(result.selectedWorkpieceId);
      };

      const addFaceAtEdge = (parentId, edgeIndex) => {
        if (!parentId && parentId !== '') return;
        const result = addCassetteV2GraphChild(cassetteTree.value, parentId, edgeIndex);
        cassetteTree.value = result.tree;
        selectedNodeId.value = result.nodeId;
        selectedWorkpieceOverrideId.value = '';
        inspectorSelection.value = 'face';
      };

      const handleDesignerAction = ({ edge, edgeIndex }) => {
        if (inspectorSelection.value === 'attachment') return;
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
          h('label', {
            class: 'w-14 shrink-0 truncate text-technical text-muted',
            title: parameter.key
          }, parameter.key),
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
          class: 'flex min-w-0 items-center gap-2 py-0.5'
        }, [
          h(Checkbox, {
            modelValue: visibleLayerNames.value,
            value: row.layer.name,
            inputId: layerInputId(row.layer),
            size: 'small',
            'onUpdate:modelValue': updateVisibleLayerNames
          }),
          h('label', { for: layerInputId(row.layer), class: 'min-w-0 flex-1 truncate' }, [
            h('span', {
              class: 'instance-inline-chip min-w-0 max-w-full',
              title: row.layer.name
            }, [
              h('span', { class: 'instance-inline-chip-label' }, row.layer.name)
            ])
          ]),
          row.standard
            ? h(Tag, { value: row.standard?.fields?.code || '', severity: 'secondary', size: 'small' })
            : null,
          row.pen
            ? h('span', {
                class: 'block h-3 w-10 shrink-0 rounded-ui border border-content-border',
                style: {
                  backgroundColor: row.pen?.fields?.stroke?.color || 'currentColor',
                  height: `${Math.min(6, Number(row.pen?.fields?.stroke?.weight) * 2 + 1) || 3}px`
                },
                title: entitySelectLabel(row.pen, ''),
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
          body = h('div', { class: 'flex w-96 flex-col gap-2' }, [
            h('div', { class: 'flex cursor-move items-center gap-1', onMousedown: event => { event.preventDefault(); startInlineEditorDrag(event); } }, [
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
              }),
              h(Select, {
                modelValue: relation.sourceFaceId,
                options: sourceFaceOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'min-w-0 flex-1',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.sourceFace'),
                title: t('cassette.v2.attachmentFields.sourceFace'),
                onMousedown: event => event.stopPropagation(),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ sourceFaceId: value })
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
            h('div', { class: 'grid grid-cols-2 gap-2' }, [
              h(Select, {
                modelValue: relation.targetSnap,
                options: snapOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.targetSnap'),
                title: t('cassette.v2.attachmentFields.targetSnap'),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ targetSnap: value })
              }),
              h(Select, {
                modelValue: relation.sourceSnap,
                options: snapOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.sourceSnap'),
                title: t('cassette.v2.attachmentFields.sourceSnap'),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ sourceSnap: value })
              }),
              h('label', { class: 'flex min-w-0 flex-col gap-1 text-muted text-label', title: t('cassette.v2.attachmentFields.edgeMargin') }, [
                h('span', { class: 'truncate' }, t('cassette.v2.attachmentFields.edgeMargin')),
                h(CassetteExpressionEditor, {
                  modelValue: relation.offsetX,
                  parameters: globalParameters.value,
                  parameterNames: globalParameterNames.value,
                  'onUpdate:modelValue': value => updateInlineAttachmentRelation({ offsetX: value })
                })
              ]),
              h('label', { class: 'flex min-w-0 flex-col gap-1 text-muted text-label', title: t('cassette.v2.attachmentFields.normalOffset') }, [
                h('span', { class: 'truncate' }, t('cassette.v2.attachmentFields.normalOffset')),
                h(CassetteExpressionEditor, {
                  modelValue: relation.offsetY,
                  parameters: globalParameters.value,
                  parameterNames: globalParameterNames.value,
                  'onUpdate:modelValue': value => updateInlineAttachmentRelation({ offsetY: value })
                })
              ]),
              h('label', { class: 'flex min-w-0 flex-col gap-1 text-muted text-label', title: t('cassette.v2.attachmentFields.rotation') }, [
                h('span', { class: 'truncate' }, t('cassette.v2.attachmentFields.rotation')),
                h(CassetteExpressionEditor, {
                  modelValue: relation.rotation,
                  parameters: globalParameters.value,
                  parameterNames: globalParameterNames.value,
                  'onUpdate:modelValue': value => updateInlineAttachmentRelation({ rotation: value })
                })
              ]),
              h(Select, {
                modelValue: relation.targetSide,
                options: sideOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.side'),
                title: t('cassette.v2.attachmentFields.side'),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ targetSide: value })
              }),
              h(Select, {
                modelValue: relation.placementMode,
                options: placementModeOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.placementMode'),
                title: t('cassette.v2.attachmentFields.placementMode'),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ placementMode: value })
              }),
              relation.placementMode === 'edgeArray'
                ? h(Select, {
                    modelValue: relation.arrayEdge,
                    options: edgeOptions.value,
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
                ? h(Select, {
                    modelValue: relation.arrayMode,
                    options: arrayModeOptions.value,
                    optionLabel: 'label',
                    optionValue: 'value',
                    class: 'w-full',
                    size: 'small',
                    'aria-label': t('cassette.v2.attachmentFields.arrayMode'),
                    title: t('cassette.v2.attachmentFields.arrayMode'),
                    'onUpdate:modelValue': value => updateInlineAttachmentRelation({ placementMode: 'edgeArray', arrayMode: value })
                  })
                : null,
              relation.placementMode === 'edgeArray'
                ? h('label', { class: 'flex min-w-0 flex-col gap-1 text-muted text-label', title: arrayValueLabel(relation) }, [
                    h('span', { class: 'truncate' }, arrayValueLabel(relation)),
                    h(CassetteExpressionEditor, {
                      modelValue: arrayValue(relation),
                      parameters: globalParameters.value,
                      parameterNames: globalParameterNames.value,
                      'onUpdate:modelValue': value => updateInlineAttachmentRelation(arrayValuePatch(relation, value))
                    })
                  ])
                : null,
              h('div', { class: 'flex min-w-0 gap-1' }, [
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
              ]),
              h(Select, {
                modelValue: relation.type,
                options: jointTypeOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                class: 'w-full',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.jointType'),
                title: t('cassette.v2.attachmentFields.jointType'),
                'onUpdate:modelValue': value => updateInlineAttachmentRelation({ type: value })
              }),
              h(Button, {
                icon: 'pi pi-map-marker',
                severity: relation.driver ? 'primary' : 'secondary',
                size: 'small',
                'aria-label': t('cassette.v2.attachmentFields.driver'),
                title: t('cassette.v2.attachmentFields.driver'),
                onClick: () => updateInlineAttachmentRelation({ driver: true })
              }),
              h(Button, {
                icon: 'pi pi-trash',
                severity: 'danger',
                size: 'small',
                'aria-label': t('cassette.v2.removeAttachment'),
                title: t('cassette.v2.removeAttachment'),
                onClick: deleteInlineAttachmentRelation
              })
            ])
          ]);
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

      const renderInspector = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' }, [
          h('div', { class: 'flex items-center justify-between gap-2' }, [
            h('strong', { class: 'truncate' }, t('cassette.v2.workpieces')),
            h('div', { class: 'flex items-center gap-1' }, [
              h(Tag, { value: assemblySummary.value, severity: 'secondary', size: 'small' }),
              h(Button, {
                icon: 'pi pi-sliders-v',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('cassette.v2.addProfile'),
                title: t('cassette.v2.addProfile'),
                onClick: () => openProfileDialog()
              }),
              h(Button, {
                icon: 'pi pi-bolt',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('cassette.v2.addHardware'),
                title: t('cassette.v2.addHardware'),
                onClick: addHardwareToSelectedWorkpiece
              })
            ])
          ]),
          h(ScrollPanel, { class: 'min-h-0 flex-1 rounded-ui border border-content-border' }, () =>
            h('div', { class: 'flex flex-col' },
              workpieceRows.value.map(row => h('div', {
                key: row.id,
                class: 'border-b border-content-border p-2 last:border-b-0'
              }, [
                h('div', { class: 'flex min-w-0 items-center gap-2' }, [
                  h('button', {
                    type: 'button',
                    class: ['flex min-w-0 flex-1 items-center gap-2 rounded-ui border border-transparent px-2 py-1 text-left', row.id === selectedWorkpieceId.value ? 'border-primary bg-subtle' : ''].filter(Boolean).join(' '),
                    onClick: () => handleWorkpieceGraphNodeSelect(row.id)
                  }, [
                    h('span', { class: 'h-2.5 w-2.5 shrink-0 rounded-full', style: workpieceAccentStyle(row.id), 'aria-hidden': 'true' }),
                    h('span', { class: 'truncate' }, row.label),
                    row.parentCount > 1 ? h(Tag, { value: `×${row.parentCount}`, severity: 'secondary', size: 'small' }) : null
                  ]),
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
                    severity: row.id === pendingAttachmentSourceId.value ? 'primary' : 'secondary',
                    text: true,
                    rounded: true,
                    size: 'small',
                    'aria-label': t('cassette.v2.addAttachment'),
                    title: t('cassette.v2.addAttachment'),
                    onClick: () => startAttachmentConnect(row.id)
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
                ]),
                row.id === selectedWorkpieceId.value && row.isHardware
                  ? h('div', { class: 'mt-2 grid grid-cols-2 gap-2 pl-4' }, [
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
                        : null,
                      row.family === 'hanger_clip'
                        ? h(Select, {
                            modelValue: row.profileTemplateId || '',
                            options: profileTemplateOptions.value,
                            optionLabel: 'label',
                            optionValue: 'value',
                            size: 'small',
                            class: 'w-full',
                            placeholder: t('cassette.v2.profileEditor.loadTemplate'),
                            'aria-label': t('cassette.v2.profileEditor.loadTemplate'),
                            onClick: ensureProfileTemplatesLoaded,
                            onFocus: ensureProfileTemplatesLoaded,
                            onShow: ensureProfileTemplatesLoaded,
                            'onUpdate:modelValue': value => updateSelectedHardwareProfile(value)
                          })
                        : null
                    ])
                  : null,
                row.relations.length
                  ? h('div', { class: 'mt-2 flex flex-col gap-1 pl-4' },
                    row.relations.map(relationRow => h('div', {
                      key: `${row.id}-${relationRow.relation.id}-${relationRow.direction}`,
                      class: 'flex min-w-0 items-center gap-1'
                    }, [
                      h('button', {
                        type: 'button',
                        class: ['flex min-w-0 flex-1 items-center gap-2 rounded-ui border px-2 py-1 text-left', relationRow.relation.id === selectedRelationId.value ? 'border-primary bg-subtle' : 'border-content-border'],
                        onClick: event => selectWorkpieceRelation(relationRow.relation.id, event)
                      }, [
                        h('span', { class: 'shrink-0 text-muted text-technical' }, relationRow.arrow),
                        h('span', { class: 'truncate text-body' }, relationRow.otherLabel),
                        h('small', { class: 'truncate text-muted' }, relationRow.faceLabel),
                        relationRow.relation.driver
                          ? h(Tag, { value: t('cassette.v2.driver'), severity: 'secondary', size: 'small' })
                          : null,
                        relationRow.status !== 'ok'
                          ? h(Tag, {
                              value: t(`cassette.v2.attachmentStatus.${relationRow.status}`),
                              severity: relationStatusSeverity(relationRow.status),
                              size: 'small'
                            })
                          : null
                      ]),
                      h(Button, {
                        icon: 'pi pi-trash',
                        severity: 'danger',
                        text: true,
                        rounded: true,
                        size: 'small',
                        'aria-label': t('cassette.v2.removeAttachment'),
                        title: t('cassette.v2.removeAttachment'),
                        onClick: () => deleteWorkpieceRelation(relationRow.relation.id)
                      })
                    ])))
                  : null
              ])))
          )
        ]),
        h('div', { class: 'h-48 shrink-0 overflow-hidden' }, [
          h(CassetteFoldedPreview, {
            preview: cassettePreviewSource.value?.foldedPreview,
            selectedFaceId: selectedNodeId.value,
            selectedWorkpieceId: selectedWorkpieceId.value,
            isolatedWorkpieceId: foldedPreviewWorkpieceId.value,
            'onUpdate:isolatedWorkpieceId': value => { foldedPreviewWorkpieceId.value = value; },
            titleKey: 'cassette.v2.cassetteFoldedPreview',
            onWorkpieceSelect: selectWorkpieceForInspector
          })
        ])
      ]);

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

      const templateOptions = computed(() => templateRecords.value.map(cassette => ({
        label: cassette.name || cassette._id,
        value: cassette._id?.toString(),
        entity: cassette
      })));

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
              source: drawingCanvasSource.value,
              sourceType: 'geometry-preview',
              mode: 'designer',
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
              ? h(InstanceSelect, {
                  modelValue: null,
                  options: templateOptions.value,
                  optionLabel: 'label',
                  optionValue: 'value',
                  typeId: 'cassette',
                  placeholder: t('cassette.v2.loadTemplate'),
                  class: 'w-full',
                  'onUpdate:modelValue': value => {
                    loadTemplateInto(value);
                    closeDockPopover();
                  }
                })
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
        h(StandardDialog, {
          visible: occsDialogVisible.value,
          'onUpdate:visible': value => { occsDialogVisible.value = value; },
          header: t('cassette.v2.occsDraft'),
          size: 'lg',
          showDefaultFooter: false
        }, () => [
          h(Textarea, { modelValue: occsJson.value, readonly: true, rows: 24, class: 'w-full text-technical' })
        ]),
        h(StandardDialog, {
          visible: profileDialogVisible.value,
          'onUpdate:visible': value => { profileDialogVisible.value = value; },
          header: t('cassette.v2.profileEditor.title'),
          size: 'lg'
        }, {
          default: () => h('div', { class: 'flex min-h-0 flex-col gap-3' }, [
            h('div', { class: 'grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_12rem]' }, [
              h(InputText, {
                modelValue: profileDraft.value.name,
                'onUpdate:modelValue': value => { profileDraft.value.name = value; },
                placeholder: t('cassette.v2.profileEditor.name'),
                class: 'w-full'
              }),
              h(Select, {
                modelValue: profileDraft.value.kind,
                options: profileKindOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                appendTo: 'self',
                class: 'w-full',
                'onUpdate:modelValue': value => { profileDraft.value.kind = value; }
              }),
              h(Select, {
                modelValue: profileDraft.value.process,
                options: profileProcessOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                appendTo: 'self',
                class: 'w-full',
                'onUpdate:modelValue': value => { profileDraft.value.process = value; }
              })
            ]),
            h(Select, {
              modelValue: selectedProfileTemplateId.value,
              options: profileTemplateOptions.value,
              optionLabel: 'label',
              optionValue: 'value',
              typeId: 'profileTemplate',
              placeholder: t('cassette.v2.profileEditor.loadTemplate'),
              appendTo: 'self',
              class: 'w-full',
              onFocus: ensureProfileTemplatesLoaded,
              onShow: ensureProfileTemplatesLoaded,
              'onUpdate:modelValue': loadProfileTemplateDraft
            }),
            h(ProfileSketchEditor, {
              modelValue: profileDraft.value.sketch,
              'onUpdate:modelValue': value => { profileDraft.value.sketch = value; },
              onProfile: value => { profileDraft.value.occsProfile = value; }
            })
          ]),
          footer: () => h('div', { class: 'flex w-full flex-wrap justify-between gap-2' }, [
            h(Button, {
              label: t('common.save'),
              icon: 'pi pi-save',
              size: 'small',
              loading: profileSaving.value,
              disabled: profileSaving.value,
              onClick: saveProfileDraft
            }),
            h(Button, {
              label: t('common.cancel'),
              severity: 'secondary',
              text: true,
              size: 'small',
              onClick: () => { profileDialogVisible.value = false; }
            })
          ])
        })
      ]);
    }
  });
}
