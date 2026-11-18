import { readFile } from 'node:fs/promises';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TemplateValuesRow from './TemplateValuesRow.vue';
import TemplateValuesControl from '../process-designer/TemplateValuesControl.vue';

async function render(component, props) {
  const app = createSSRApp({ render: () => h(component, props) });
  app.config.globalProperties.$t = key => key;
  return await renderToString(app);
}

describe('HAG and graph template value controls', () => {
  const values = {
    title: 'Quarterly report',
    items: [{ label: 'Revenue', amount: 120 }]
  };

  it('renders HAG scalar tokens and repeat-section arrays from shared metadata', async () => {
    const html = await render(TemplateValuesRow, {
      modelValue: values,
      tokens: ['title'],
      sections: ['items']
    });

    expect(html).toContain('aria-label="title"');
    expect(html).toContain('Quarterly report');
    expect(html).toContain('template-section-items');
    expect(html).toContain('Revenue');
    expect(html).toContain('processDesigner.templateSectionJsonHint');
  });

  it('renders graph inspector scalar tokens and repeat-section arrays from shared metadata', async () => {
    const html = await render(TemplateValuesControl, {
      modelValue: values,
      tokens: ['title'],
      sections: ['items']
    });

    expect(html).toContain('template-value-title');
    expect(html).toContain('Quarterly report');
    expect(html).toContain('template-section-items');
    expect(html).toContain('Revenue');
    expect(html).toContain('processDesigner.templateSectionJsonHint');
  });

  it('wires transient section metadata from the fill preview into the HAG form', async () => {
    const dialog = await readFile(new URL('./ActionFormDialog.vue', import.meta.url), 'utf8');
    expect(dialog).toContain(':sections="previewSections"');
    expect(dialog).toContain('previewMeta.value?.sections');
    expect(dialog).toContain("watch(() => templateDraftRef.value?.id || '', () => { previewMeta.value = null; })");
  });

  it('keeps repeat-section JSON drafts local until they parse as arrays', async () => {
    const [hag, graph] = await Promise.all([
      readFile(new URL('./TemplateValuesRow.vue', import.meta.url), 'utf8'),
      readFile(new URL('../process-designer/TemplateValuesControl.vue', import.meta.url), 'utf8')
    ]);

    for (const source of [hag, graph]) {
      expect(source).toContain('JSON.parse(source)');
      expect(source).toContain('if (!Array.isArray(value))');
      expect(source).toContain('sectionDrafts.value = { ...sectionDrafts.value, [section]: source }');
      expect(source).toContain('sectionErrors.value = { ...sectionErrors.value, [section]:');
    }
  });
});
