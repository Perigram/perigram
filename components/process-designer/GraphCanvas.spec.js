import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readComponent = path => readFile(new URL(path, import.meta.url), 'utf8');

describe('graph editor workspace chrome', () => {
  it('uses the app chrome alone — no floating/glass variant', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');
    const workspace = await readComponent('../shared/DesignerWorkspace.vue');
    const palette = await readComponent('./PaletteDock.vue');

    for (const source of [canvas, editor, workspace, palette]) {
      expect(source).not.toMatch(/chrome-variant|chromeVariant/);
      expect(source).not.toMatch(/backdrop-blur/);
      expect(source).not.toMatch(/variant === 'floating'/);
    }
    expect(palette).toContain('data-designer-palette-strip');
  });

  it('exposes evaluation state as a direct toggle to the preview workspace', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');
    const workspace = await readComponent('../shared/DesignerWorkspace.vue');

    expect(canvas).toContain('data-canvas-status');
    expect(canvas).toContain('onActivityClick');
    expect(editor).toContain('openActivitySurface');
    expect(editor).toContain("canvasFrame?.openPanel?.('preview')");
    expect(editor).toContain('GraphDocumentPreviewPanel');
    expect(canvas).toContain('<slot name="preview" />');
    expect(workspace).toContain('data-designer-preview');
    expect(workspace).toContain('beginPreviewResize');
    expect(workspace).not.toContain('name="support"');
  });
});
