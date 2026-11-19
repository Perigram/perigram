// StandardDialog's default footer resolves through i18n: the cancel and
// save labels come from `common.cancel`/`common.save` unless a caller
// overrides them (shared/README.md → StandardDialog). The Dialog
// primitive is stubbed — the contract under test is the label
// resolution, and PrimeVue's portal renders nothing server-side.
import { describe, it, expect, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';

vi.mock('primevue/dialog', () => ({
  default: {
    name: 'DialogStub',
    inheritAttrs: true,
    render() {
      return h('div', { class: 'dialog-stub' }, [
        this.$slots.header?.(),
        this.$slots.default?.(),
        this.$slots.footer?.()
      ]);
    }
  }
}));
const StandardDialog = (await import('~/components/shared/StandardDialog.vue')).default;

const i18n = createI18n({
  legacy: false,
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { common: { cancel: 'Cancel-en', save: 'Save-en' } }, ru: { common: { cancel: 'Отмена', save: 'Сохранить' } } }
});

async function mount(props) {
  const app = createSSRApp({ render: () => h(StandardDialog, { showDefaultFooter: true, ...props }) });
  app.use(i18n);
  return renderToString(app);
}

describe('StandardDialog default footer labels', () => {
  it('resolves cancel and save through the active locale', async () => {
    i18n.global.locale.value = 'en';
    const html = await mount();
    expect(html).toContain('Cancel-en');
    expect(html).toContain('Save-en');
    i18n.global.locale.value = 'ru';
    const ruHtml = await mount();
    expect(ruHtml).toContain('Отмена');
    expect(ruHtml).toContain('Сохранить');
  });

  it('lets callers override the verbs', async () => {
    const html = await mount({ cancelLabel: 'Dismiss', saveLabel: 'Apply' });
    expect(html).toContain('Dismiss');
    expect(html).toContain('Apply');
  });
});
