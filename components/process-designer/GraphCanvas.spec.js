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
    expect(palette).toContain('data-designer-palette');
  });

  it('exposes evaluation state as a direct toggle to the preview workspace', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');
    const workspace = await readComponent('../shared/DesignerWorkspace.vue');

    expect(canvas).toContain('data-canvas-status');
    expect(canvas).toContain('onActivityClick');
    expect(canvas).toContain('workspace-id="graph-editor"');
    expect(editor).toContain('openActivitySurface');
    expect(editor).toContain("canvasFrame.value?.openPanel?.('preview')");
    expect(editor).toContain('GraphDocumentPreviewPanel');
    expect(canvas).toContain('<slot name="preview" />');
    expect(workspace).toContain('WorkspaceDock');
    expect(workspace).toContain('sizePanelToContent');
    expect(workspace).not.toContain('name="support"');
  });
});
