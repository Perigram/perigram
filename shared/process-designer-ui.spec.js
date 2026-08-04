import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const nodeSource = fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer/ProcessNode.vue'), 'utf8');
const statusNodeSource = fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer/ProcessStatusDefinitionNode.vue'), 'utf8');
const motionDockSource = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/MotionDock.vue'), 'utf8');
const reducedMotionSource = fs.readFileSync(path.join(REPO_ROOT, 'composables/useReducedMotion.js'), 'utf8');
const motionTokenSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/tokens/index.js'), 'utf8');
const designerSource = fs.readFileSync(path.join(REPO_ROOT, 'pages/organization/process.vue'), 'utf8');
const selectedNodeSources = [
  'ProcessActionNode.vue',
  'ProcessEntityNode.vue',
  'ProcessNode.vue',
  'ProcessServiceNode.vue',
  'ProcessSocketNode.vue',
  'ProcessStatusDefinitionNode.vue',
  'ProcessValueInputNode.vue'
].map((file) => fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer', file), 'utf8'));
const socketContractSources = [
  'ProcessActionNode.vue',
  'ProcessEntityNode.vue',
  'ProcessNode.vue',
  'ProcessRoleNode.vue',
  'ProcessServiceNode.vue',
  'ProcessSocketNode.vue',
  'ProcessStatusDefinitionNode.vue',
  'ProcessUserNode.vue',
  'ProcessValueInputNode.vue'
].map((file) => fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer', file), 'utf8'));

describe('process designer canvas UI', () => {
  it('keeps process nodes compact and aligns sockets by shared rows', () => {
    expect(nodeSource).toContain("'relative w-72 rounded-ui border");
    expect(nodeSource).toContain('const socketRows = computed(() => alignSockets');
    expect(nodeSource).toContain('grid min-h-7 grid-cols-2 gap-x-5');
    expect(nodeSource).toContain('border-b border-content-border py-1');
    expect(nodeSource).toContain('!top-1/2 !h-2.5 !w-2.5 !-translate-y-1/2');
    expect(nodeSource).not.toContain('{{ input.typeLabel }}');
    expect(nodeSource).not.toContain('{{ output.typeLabel }}');
    expect(nodeSource).toContain(':title="socketTitle(row.input)"');
    expect(statusNodeSource).toContain("'relative w-56 rounded-ui border");
    expect(statusNodeSource).not.toContain('evidenceOpen');
    expect(statusNodeSource).not.toContain('text-[10px] text-muted-color');
  });

  it('uses one border for selected process nodes', () => {
    for (const source of selectedNodeSources) {
      expect(source).toContain("props.selected ? 'border-primary' : 'border-content-border'");
      expect(source).not.toContain('ring-2');
    }
  });

  it('uses one socket-tone contract for ports and wires', () => {
    for (const source of socketContractSources) {
      expect(source).toContain('processSocketHandleStyle');
      expect(source).not.toContain('function socketTone');
    }

    expect(designerSource).toContain('processSocketColor(sourcePort)');
    expect(designerSource).toContain('bg-process-canvas');
    expect(designerSource).not.toContain('bg-content/95');
  });

  it('keeps derived socket specifications on the node instead of duplicating them in the inspector', () => {
    expect(designerSource).not.toContain('v-for="input in selectedProcessNode.inputs"');
    expect(designerSource).not.toContain('v-for="output in selectedProcessNode.outputs"');
    expect(nodeSource).toContain('const inputSpecs = computed');
    expect(nodeSource).toContain('const outputSpecs = computed');
  });

  it('keeps policy configuration in the inspector instead of every node', () => {
    expect(nodeSource).not.toContain('effectGrants');
    expect(nodeSource).not.toContain('<MultiSelect');
    expect(designerSource).toContain('selectedProcessNodeGrants');
    expect(designerSource).toContain('addSelectedProcessNodeGrant');
  });

  it('keeps structural block operations independent from entity selection', () => {
    expect(nodeSource).toContain("'record.getField', 'record.composeBlock', 'record.modifyBlock', 'record.construct'");
    expect(designerSource).toContain('designer.fieldsForBlock(node.block)');
    expect(designerSource).toContain('processNodeHasSelectableFieldSet(selectedProcessNode)');
    expect(designerSource).toContain("delete node.entityType");
    expect(designerSource).toContain('delete node.fieldSchemas');
  });

  it('owns multi-selection deletion and broad canvas navigation bounds', () => {
    expect(designerSource).toContain(':delete-key-code="null"');
    expect(designerSource).toContain(':selection-key-code="true"');
    expect(designerSource).toContain(':pan-on-drag="false"');
    expect(designerSource).toContain('pan-activation-key-code="Space"');
    expect(designerSource).toContain(':pan-on-scroll="true"');
    expect(designerSource).toContain(':zoom-on-scroll="false"');
    expect(designerSource).toContain(':zoom-on-pinch="true"');
    expect(designerSource).toContain('function handleDesignerWheel(event)');
    expect(designerSource).toContain(':min-zoom="0.1"');
    expect(designerSource).toContain(':max-zoom="4"');
    expect(designerSource).toContain('nodes.value.filter(node => node.selected)');
    expect(designerSource).toContain('function deleteGraphSelection()');
    expect(designerSource).toContain("event.key === 'Home'");
    expect(designerSource).toContain("event.code === 'NumpadDecimal'");
    expect(designerSource).toContain('function nextNodePosition()');
    expect(designerSource).toContain('Math.abs(Number(position.x || 0) - candidate.x) < 300');
  });

  it('persists the live viewport without serializing transient selection', () => {
    expect(designerSource).toContain('const viewport = getViewport?.()');
    expect(designerSource).toContain('delete runtimeFreeNode.selected');
    expect(designerSource).toContain('setViewport(canvas.viewport');
  });

  it('uses the shared motion dock for semantic hover panels', () => {
    expect(designerSource).toContain('v-if="paletteOpen"');
    expect(designerSource).toContain('v-if="inspectorOpen"');
    expect(designerSource).toContain('<MotionDock');
    expect(designerSource).toContain(':items="designerDockItems"');
    expect(designerSource).not.toContain('designTokens.dock');
    expect(motionDockSource).toContain("from 'motion-v'");
    expect(motionDockSource).toContain("name: 'MotionDock'");
    expect(motionDockSource).toContain('useMotionValue(Infinity)');
    expect(motionDockSource).toContain('useSpring(targetSize, props.spring)');
    expect(motionDockSource).toContain('useReducedMotion');
    expect(motionDockSource).toContain('if (props.reducedMotion) return props.baseItemSize');
    expect(motionDockSource).toContain('var(--p-content-background)');
    expect(motionDockSource).not.toContain("backgroundColor: '#111'");
    expect(motionDockSource).not.toContain("border: '1px solid #222'");
    expect(reducedMotionSource).toContain("'(prefers-reduced-motion: reduce)'");
    expect(reducedMotionSource).toContain("mediaQuery.addEventListener('change', syncPreference)");
    expect(motionTokenSource).toContain("emphasis: '220ms'");
    expect(motionTokenSource).toContain("standard: 'cubic-bezier(0.2, 0, 0, 1)'");
    expect(motionTokenSource).toContain('dock: { mass: 0.1, stiffness: 180, damping: 16 }');
    expect(designerSource).not.toContain('absolute inset-x-3 top-3 z-30');
    expect(designerSource).toContain('absolute left-3 top-3 z-20');
    expect(designerSource).toContain('absolute bottom-16 right-3 top-3 z-20');
    expect(designerSource).toContain('paletteOpen.value = !paletteOpen.value');
    expect(designerSource).toContain('inspectorOpen.value = !inspectorOpen.value');
    expect(designerSource).toContain('<Popover ref="processMenu"');
    expect(designerSource).toContain('<Popover ref="canvasMenu"');
    expect(designerSource).not.toContain('validationMenu');
    expect(designerSource).toContain('icon: () => h(\'i\', { class: \'pi pi-th-large\'');
    expect(designerSource).toContain('icon: () => h(\'i\', { class: \'pi pi-folder\'');
    expect(designerSource).toContain("label: t('processDesigner.canvasNavigation')");
    expect(designerSource).toContain('onHoverStart: event => openDockPopover(\'navigation\', event)');
    expect(designerSource).toContain('onHoverStart: event => openDockPopover(\'process\', event)');
    expect(designerSource).toContain('<Select');
    expect(designerSource).toContain('@update:model-value="selectProcessDefinition"');
    expect(designerSource).toContain('@show="pinDockPopover(\'process\')"');
    expect(designerSource).toContain('@hide="unpinDockPopover(\'process\')"');
    expect(designerSource).toContain('function selectProcessDefinition(processId)');
    expect(designerSource).toContain('createDraftFromDock');
    expect(designerSource).toContain('saveDraftFromDock');
    expect(designerSource).toContain('attention: isDirty.value');
    expect(motionDockSource).toContain('this.item.attention');
    expect(motionDockSource).toContain('onHoverStart?: (event: MouseEvent) => void');
    expect(motionDockSource).toContain('props.item.onHoverStart?.(event)');
    expect(motionDockSource).toContain('props.item.onHoverEnd?.(event)');
    expect(motionDockSource).toContain("boundButton?.addEventListener('click', handleClick)");
    expect(motionDockSource).toContain("boundButton?.removeEventListener('click', handleClick)");
    expect(motionDockSource).toContain('ref: this.setItemRef');
    expect(designerSource).not.toContain('draftStateLabel');
    expect(designerSource).toContain('onClick: applyProcess');
    expect(designerSource).toContain("summary: t('processDesigner.newDraft')");
    expect(designerSource).toContain('return created;');
    expect(designerSource).toContain('await createDraft({ empty: true });');
    expect(designerSource).toContain('createDraft({ copyActive: isActiveProcess.value })');
    expect(designerSource).not.toContain('validateDraft');
    expect(designerSource).toContain('if (!result.ok) throw new Error');
  });

  it('restores inferred node records when a proposed wire is rejected', () => {
    expect(designerSource).toContain('const processNodeSnapshot = clonePlainData');
    expect(designerSource).not.toContain('structuredClone(draft.value?.data?.processNodes');
    expect(designerSource).toContain('draft.value.data.processNodes = processNodeSnapshot');
  });
});
