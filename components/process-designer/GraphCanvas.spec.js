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

  it('mounts the preview workspace as a dock panel over the shared canvas', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');
    const workspace = await readComponent('../shared/DesignerWorkspace.vue');

    expect(canvas).toContain('workspace-id="graph-editor"');
    expect(editor).toContain("canvasFrame.value?.panels?.preview");
    expect(editor).toContain('GraphDocumentPreviewPanel');
    expect(canvas).toContain('<slot name="preview" />');
    expect(workspace).toContain('WorkspaceDock');
    expect(workspace).toContain('sizePanelToContent');
    expect(workspace).not.toContain('name="support"');
  });

  it('keeps the canvas free of standing state chrome', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');

    expect(canvas).not.toContain('data-canvas-status');
    expect(canvas).toContain("validation && (!validation.ok || (validation.warnings || []).length || validationDiffLines.length)");
  });
});
