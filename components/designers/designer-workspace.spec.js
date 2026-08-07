import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(new URL('../shared/DesignerWorkspace.vue', import.meta.url), 'utf8');
const surfaceSource = readFileSync(new URL('../shared/DesignerSurface.vue', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../shared/DesignerDialog.vue', import.meta.url), 'utf8');
const viewportSource = readFileSync(new URL('../shared/ThreeViewport.vue', import.meta.url), 'utf8');
const cassetteSource = readFileSync(new URL('../CassetteDesignerV2.vue', import.meta.url), 'utf8');
const processSource = readFileSync(new URL('../../pages/organization/process.vue', import.meta.url), 'utf8');
const facadeSource = readFileSync(new URL('../FacadeDesigner.vue', import.meta.url), 'utf8');
const facadePatternSource = readFileSync(new URL('../FacadePatternDesigner.vue', import.meta.url), 'utf8');
const cassetteManagerSource = readFileSync(new URL('../CassetteManager.vue', import.meta.url), 'utf8');
const cassetteActionSource = readFileSync(new URL('../generated/GeneratedCassetteDesignerAction.vue', import.meta.url), 'utf8');

describe('designer workspace contract', () => {
  it('keeps layout ownership in the shared shell', () => {
    expect(workspaceSource).toContain("['lanes', 'canvas']");
    expect(workspaceSource).toContain('<slot name="palette" />');
    expect(workspaceSource).toContain('<slot name="inspector" />');
    expect(workspaceSource).toContain('<slot name="dock" />');
    expect(workspaceSource).toContain('container-type: inline-size');
    expect(surfaceSource).toContain('data-designer-surface');
    expect(surfaceSource).toContain('h-full min-h-0 min-w-0 flex-1');
    expect(dialogSource).toContain('h-[100dvh]');
  });

  it('gives Three.js lifecycle and selection ownership to the shared viewport', () => {
    expect(viewportSource).toContain('new THREE.WebGLRenderer');
    expect(viewportSource).toContain('new ResizeObserver');
    expect(viewportSource).toContain("emit('select'");
    expect(viewportSource).toContain('disposeObject');
  });

  it('routes every operational designer through the shared layout contract', () => {
    expect(cassetteSource).toContain('<DesignerWorkspace layout="lanes"');
    expect(cassetteSource).toContain('<DesignerSurface');
    expect(cassetteSource).toContain('<template #palette>');
    expect(cassetteSource).toContain('<template #inspector>');
    expect(processSource).toContain('<DesignerWorkspace');
    expect(processSource).toContain('<DesignerSurface>');
    expect(processSource).toContain('layout="canvas"');
    expect(processSource).toContain('<template v-if="paletteOpen" #palette>');
    expect(processSource).toContain('<template v-if="inspectorOpen" #inspector>');
    expect(processSource).toContain('<template #dock>');
    expect(facadeSource).toContain('<DesignerWorkspace layout="lanes"');
    expect(facadeSource).toContain('<DesignerSurface>');
    expect(facadePatternSource).toContain('<DesignerWorkspace layout="canvas"');
    expect(facadePatternSource).toContain('<DesignerSurface>');
    expect(cassetteManagerSource).toContain('<DesignerDialog');
    expect(cassetteActionSource).toContain('<DesignerDialog');
  });
});
