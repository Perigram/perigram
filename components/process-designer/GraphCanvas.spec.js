import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readComponent = path => readFile(new URL(path, import.meta.url), 'utf8');

describe('floating graph editor chrome', () => {
  it('keeps the process plane as the default and opts the graph editor into floating chrome', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');
    const workspace = await readComponent('../shared/DesignerWorkspace.vue');
    const palette = await readComponent('./PaletteDock.vue');

    expect(canvas).toContain("chromeVariant: { type: String, default: 'plane'");
    expect(editor).toContain('chrome-variant="floating"');
    expect(workspace).toContain('backdrop-blur-md');
    expect(palette).toContain('data-designer-palette-strip');
  });

  it('exposes evaluation state as a direct toggle to the activity surface', async () => {
    const canvas = await readComponent('./GraphCanvas.vue');
    const editor = await readComponent('./GraphEditorSurface.vue');

    expect(canvas).toContain('data-canvas-status');
    expect(canvas).toContain('onActivityClick');
    expect(editor).toContain('openActivitySurface');
    expect(editor).toContain("canvasFrame?.openPanel?.('support')");
    expect(editor).toContain('GraphDocumentPreviewPanel');
    expect(canvas).toContain('<slot name="support" />');
  });
});
