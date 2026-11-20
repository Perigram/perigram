// Designer workspace shell SSR: the host canvas renders server-side and
// the dock overlay mounts client-side, so the server markup carries the
// canvas alone.
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import en from '~/i18n/locales/en.json';

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({
    userData: { id: 'u1', organizationId: 'o1' },
    organizationData: { _id: 'o1' }
  })
}));

vi.mock('~/utils/designer-workspace-state.js', () => ({
  designerWorkspaceStorageKey: () => 'designer:key',
  loadDesignerWorkspaceState: () => ({ layout: null }),
  saveDesignerWorkspaceState: () => {}
}));

async function renderWorkspace() {
  const DesignerWorkspace = (await import('./DesignerWorkspace.vue')).default;
  const app = createSSRApp({
    render: () => h(DesignerWorkspace, { layout: 'lanes', workspaceId: 'graph-editor' }, {
      default: () => h('div', { 'data-canvas-content': '' }, 'canvas'),
      palette: () => h('div', 'palette'),
      inspector: () => h('div', 'inspector'),
      preview: () => h('div', 'preview')
    })
  });
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }));
  app.directive('tooltip', {});
  return renderToString(app);
}

describe('designer workspace shell', () => {
  it('renders the canvas server-side and leaves the dock client-side', async () => {
    const html = await renderWorkspace();
    expect(html).toContain('data-designer-layout="lanes"');
    expect(html).toContain('data-canvas-content');
    expect(html).not.toContain('dv-groupview');
  }, 15000);
});
