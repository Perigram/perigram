import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(new URL('../shared/DesignerWorkspace.vue', import.meta.url), 'utf8');
const viewportSource = readFileSync(new URL('../shared/ThreeViewport.vue', import.meta.url), 'utf8');
const cassetteSource = readFileSync(new URL('../CassetteDesignerV2.vue', import.meta.url), 'utf8');
const processSource = readFileSync(new URL('../../pages/organization/process.vue', import.meta.url), 'utf8');

describe('designer workspace contract', () => {
  it('keeps layout ownership in the shared shell', () => {
    expect(workspaceSource).toContain("['lanes', 'canvas']");
    expect(workspaceSource).toContain('<slot name="palette" />');
    expect(workspaceSource).toContain('<slot name="inspector" />');
    expect(workspaceSource).toContain('<slot name="dock" />');
    expect(workspaceSource).toContain('container-type: inline-size');
  });

  it('gives Three.js lifecycle and selection ownership to the shared viewport', () => {
    expect(viewportSource).toContain('new THREE.WebGLRenderer');
    expect(viewportSource).toContain('new ResizeObserver');
    expect(viewportSource).toContain("emit('select'");
    expect(viewportSource).toContain('disposeObject');
  });

  it('moves existing designers onto the shared layout contract', () => {
    expect(cassetteSource).toContain('<DesignerWorkspace layout="lanes"');
    expect(cassetteSource).toContain('<template #palette>');
    expect(cassetteSource).toContain('<template #inspector>');
    expect(processSource).toContain('<DesignerWorkspace');
    expect(processSource).toContain('layout="canvas"');
  });
});
