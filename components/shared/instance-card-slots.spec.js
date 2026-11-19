// InstanceCard's per-variant slot contract (shared/README.md →
// InstanceCard): a supplied slot renders in the variants that support it
// and warns in the ones that do not — silent drops are the defect class
// this pins. Mounts through vue/server-renderer with the stub seam
// (test-tools) like the timeline-collection spec.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n, useI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { useAuthStore } from '~/stores/auth';
import { DESIGN_SYSTEM_CARD_COMPONENTS } from '~/utils/design-system-cards.js';
import { DESIGN_SYSTEM_ENTITIES } from '~/utils/design-system.js';
import InstanceCard from '~/components/shared/InstanceCard.vue';

globalThis.useI18n = useI18n;
globalThis.useState = (_key, init) => ref(typeof init === 'function' ? init() : init || {});
globalThis.$fetch = vi.fn(async () => ({}));

const i18n = createI18n({
  legacy: false,
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { common: { unnamed: 'Unnamed', cancel: 'Cancel', save: 'Save' } } }
});

const instance = { _id: 'i-1', identity: { name: 'Widget One' }, fields: { name: 'Widget One' } };

async function mount(variant, slots = {}) {
  const app = createSSRApp({ render: () => h(InstanceCard, { instance, typeId: 'widget', variant }, slots) });
  app.use(i18n);
  const pinia = createPinia();
  app.use(pinia);
  const auth = useAuthStore(pinia);
  auth.user = {
    process: {
      bundle: { types: [{ id: 'widget', identifier: 'name', glyph: 'pi pi-box', fields: { name: { base: 'string', identifier: true } } }] }
    }
  };
  return renderToString(app);
}

describe('InstanceCard per-variant slot contract', () => {
  let warn;
  beforeAll(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });

  it('renders the identity chip and inline-extra in the inline variant', async () => {
    const html = await mount('inline', { 'inline-extra': () => h('b', 'EXTRA') });
    expect(html).toContain('EXTRA');
    expect(html).toContain('Widget One');
  });

  it('warns for every slot supplied outside its variant', async () => {
    const html = await mount('inline', {
      header: () => h('b', 'H'),
      subtitle: () => h('b', 'S'),
      'compact-content': () => h('b', 'C'),
      footer: () => h('b', 'F'),
      default: () => h('b', 'BODY')
    });
    expect(html).not.toContain('BODY');
    expect(html).not.toContain('FOOTER');
    const messages = warn.mock.calls.map(call => call[0]).join('\n');
    for (const name of ['header', 'subtitle', 'compact-content', 'footer', 'default']) {
      expect(messages).toContain(`"${name}" slot is unsupported in variant "inline"`);
    }
  });

  it('renders header, before-identity, subtitle and compact-content in the compact variant', async () => {
    const html = await mount('compact', {
      header: () => h('b', 'HEAD'),
      'before-identity': () => h('i', 'GLYPH'),
      subtitle: () => h('b', 'SUB'),
      'compact-content': () => h('b', 'COMPACT')
    });
    expect(html).toContain('HEAD');
    expect(html).toContain('GLYPH');
    expect(html).toContain('SUB');
    expect(html).toContain('COMPACT');
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders body and footer in the card variant', async () => {
    const html = await mount('card', {
      default: () => h('b', 'BODY'),
      footer: () => h('b', 'FOOTER')
    });
    expect(html).toContain('BODY');
    expect(html).toContain('FOOTER');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when card-only slots reach compact and compact slots reach card', async () => {
    await mount('compact', { footer: () => h('b', 'F'), default: () => h('b', 'B') });
    let messages = warn.mock.calls.map(call => call[0]).join('\n');
    expect(messages).toContain('"footer" slot is unsupported in variant "compact"');
    expect(messages).toContain('"default" slot is unsupported in variant "compact"');
    warn.mockClear();
    await mount('card', { 'compact-content': () => h('b', 'C'), 'inline-extra': () => h('b', 'I') });
    messages = warn.mock.calls.map(call => call[0]).join('\n');
    expect(messages).toContain('"compact-content" slot is unsupported in variant "card"');
    expect(messages).toContain('"inline-extra" slot is unsupported in variant "card"');
  });
});

describe('registry cards render every variant under the declared slot contract', () => {
  const messages = { en: { common: { unnamed: 'Unnamed', created: 'Created', yes: 'Yes', no: 'No' } } };
  for (const entry of DESIGN_SYSTEM_ENTITIES) {
    const card = DESIGN_SYSTEM_CARD_COMPONENTS[entry.key];
    it(`${entry.key} renders inline, compact and card without slot warnings`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const entity = entry.factory();
      for (const variant of ['inline', 'compact', 'card']) {
        const app = createSSRApp({
          render: () => h(card, { [entry.propName]: entity, variant })
        });
        app.use(createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages }));
        const pinia = createPinia();
        app.use(pinia);
        useAuthStore(pinia).user = { process: { bundle: { types: [] } } };
        const html = await renderToString(app);
        expect(html, `${entry.key}/${variant}`).toBeTruthy();
      }
      const warned = warn.mock.calls.map(call => call[0]).join('\n');
      expect(warned, warned).not.toContain('slot is unsupported');
      warn.mockRestore();
    });
  }
});
