import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import ProfileSketchEditor from './ProfileSketchEditor.vue';

vi.mock('primevue/button', () => ({ default: { name: 'Button', render: () => null } }));
vi.mock('primevue/checkbox', () => ({ default: { name: 'Checkbox', render: () => null } }));
vi.mock('primevue/inputnumber', () => ({ default: { name: 'InputNumber', render: () => null } }));
vi.mock('primevue/message', () => ({ default: { name: 'Message', render: () => null } }));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: key => key
  })
}));

describe('ProfileSketchEditor', () => {
  const renderEditor = async (modelValue) => {
    const app = createSSRApp({
      render: () => h(ProfileSketchEditor, {
        modelValue
      })
    });
    app.config.globalProperties.$t = key => key;
    return await renderToString(app);
  };

  it('renders malformed sketch input without crashing', async () => {
    await expect(renderEditor({
      version: '0.1',
      units: 'mm',
      points: undefined,
      holes: undefined,
      modifiers: undefined
    })).resolves.toContain('svg');
  });

  it('renders an empty in-progress drawing sketch without crashing', async () => {
    const html = await renderEditor({
      version: '0.1',
      units: 'mm',
      points: [],
      edges: [],
      holes: [],
      modifiers: []
    });
    expect(html).toContain('svg');
    expect(html).not.toContain('<path');
  });
});
