import { describe, expect, it } from 'vitest';
// Entry order mirrors SSR through a drawing-preview page: DrawingCanvas's
// graph (entity cards -> instance-editor-action -> file-surfaces ->
// RemoteEditorSurface -> remote-surface-mount) cycles back into the
// surface pack's own imports. The pack must resolve lazily — an eager
// object literal reads an unfinished module binding at eval time (the
// vite-node TDZ 500 / an undefined frozen into the pack under the SSR
// transform).
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import { surfaceHostContext } from '~/components/generated/remote-surface-mount.js';

describe('surface pack module cycle', () => {
  it('evaluates DrawingCanvas-first without a TDZ and resolves a full pack', () => {
    expect(DrawingCanvas).toBeTruthy();
    const ctx = surfaceHostContext({ t: key => key, te: () => true, locale: { value: 'en' } }, 1);
    for (const member of [
      'Button', 'Checkbox', 'Dialog', 'InputText', 'InputNumber', 'Message',
      'Popover', 'ScrollPanel', 'Select', 'Tag', 'Textarea',
      'DesignerSurface', 'DesignerWorkspace', 'DrawingCanvas', 'InstanceSelect', 'StandardDialog'
    ]) {
      expect(ctx.components[member], member).toBeTruthy();
    }
  });
});
