// Designer workspace shell SSR: the workspace renders its section shell
// server-side; the dock (and with it the canvas panel content) mounts
// client-side, so the server markup carries the shell alone.
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

async function renderWorkspace(props = {}) {
  const DesignerWorkspace = (await import('./DesignerWorkspace.vue')).default;
  const app = createSSRApp({
    render: () => h(DesignerWorkspace, { layout: 'lanes', workspaceId: 'graph-editor', ...props }, {
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
  it('renders the shell server-side and leaves the dock client-side', async () => {
    const html = await renderWorkspace();
    expect(html).toContain('data-designer-layout="lanes"');
    expect(html).not.toContain('data-canvas-content');
    expect(html).not.toContain('dv-groupview');
  }, 15000);

  it('ssr-renders the shell with bound document chrome', async () => {
    const html = await renderWorkspace({
      chrome: { name: 'Draft graph', dirty: false, saving: false, diverged: false }
    });
    expect(html).toContain('data-designer-layout="lanes"');
    expect(html).not.toContain('dv-groupview');
  }, 15000);
});
