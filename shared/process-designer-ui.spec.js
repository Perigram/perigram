import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const nodeSource = fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer/ProcessNode.vue'), 'utf8');
const statusNodeSource = fs.readFileSync(path.join(REPO_ROOT, 'components/process-designer/ProcessStatusDefinitionNode.vue'), 'utf8');
const designerSource = fs.readFileSync(path.join(REPO_ROOT, 'pages/organization/process.vue'), 'utf8');

describe('process designer canvas UI', () => {
  it('keeps process nodes compact and aligns sockets by shared rows', () => {
    expect(nodeSource).toContain("'relative w-64 rounded-ui border");
    expect(nodeSource).toContain('const socketRows = computed(() => alignSockets');
    expect(nodeSource).toContain('!top-1/2 !h-2.5 !w-2.5 !-translate-y-1/2');
    expect(nodeSource).not.toContain('{{ input.typeLabel }}');
    expect(nodeSource).not.toContain('{{ output.typeLabel }}');
    expect(nodeSource).toContain(':title="socketTitle(row.input)"');
    expect(statusNodeSource).toContain("'relative w-56 rounded-ui border");
    expect(statusNodeSource).not.toContain('evidenceOpen');
    expect(statusNodeSource).not.toContain('text-[10px] text-muted-color');
  });

  it('keeps policy configuration in the inspector instead of every node', () => {
    expect(nodeSource).not.toContain('effectGrants');
    expect(nodeSource).not.toContain('<MultiSelect');
    expect(designerSource).toContain('selectedProcessNodeGrants');
    expect(designerSource).toContain('addSelectedProcessNodeGrant');
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
  });

  it('persists the live viewport without serializing transient selection', () => {
    expect(designerSource).toContain('const viewport = getViewport?.()');
    expect(designerSource).toContain('delete runtimeFreeNode.selected');
    expect(designerSource).toContain('setViewport(canvas.viewport');
  });
});
