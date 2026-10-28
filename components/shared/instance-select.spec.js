import { createSSRApp, h } from 'vue';
import { createPinia } from 'pinia';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('primevue/select', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      inheritAttrs: false,
      props: ['modelValue', 'options'],
      setup(props, { slots, attrs }) {
        return () => render('div', { ...attrs, 'data-prime-select': '' }, [
          render('div', { 'data-prime-value': '' }, slots.value?.({ value: props.modelValue, placeholder: 'Choose' })),
          ...(props.options || []).map(option => slots.option?.({ option }))
        ]);
      }
    })
  };
});

vi.mock('primevue/multiselect', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      inheritAttrs: false,
      props: ['modelValue', 'options'],
      setup(props, { slots, attrs }) {
        return () => render('div', { ...attrs, 'data-prime-multiselect': '' }, [
          render('div', { 'data-prime-value': '' }, (props.modelValue || []).map(value =>
            slots.chip?.({ value, removeCallback: () => {} })
          )),
          ...(props.options || []).map(option => slots.option?.({ option }))
        ]);
      }
    })
  };
});

vi.mock('~/components/shared/InstanceInlineRef.vue', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      props: ['type', 'entity', 'variant', 'interactive'],
      setup(props) {
        return () => render('article', {
          'data-entity-id': props.entity?._id,
          'data-type-id': props.type,
          'data-variant': props.variant,
          'data-interactive': String(props.interactive)
        });
      }
    })
  };
});

import InstanceSelect from './InstanceSelect.vue';
import InstanceMultiSelect from './InstanceMultiSelect.vue';
import { instancePickerOptions } from '~/utils/instance-select.js';

const entities = [
  { _id: 'queue-1', identity: { uid: 'queue-1', name: 'Queue 1' }, data: {} },
  { _id: 'queue-2', identity: { uid: 'queue-2', name: 'Queue 2' }, data: {} }
];
const options = entities.map(entity => ({ label: entity.identity.name, value: entity._id, entity }));

async function render(component, props, slots = {}) {
  const app = createSSRApp({ render: () => h(component, props, slots) });
  app.use(createPinia());
  return await renderToString(app);
}

describe('entity Select wrappers', () => {
  it('owns every direct PrimeVue Select and MultiSelect import in app UI', () => {
    // Entity dropdowns render through the shared wrappers. The allowance
    // lists the non-entity pickers (LLM profiles and routes, providers,
    // wake-rule types/states, chat recipient and search filters, the
    // grouped create control's creation-mode select) that take plain enum
    // options.
    const enumSelectAllowance = new Set([
      'components/ChatSupport.vue',
      'components/chat/ChatComposer.vue',
      'components/chat/ChatSearchPanel.vue',
      'components/shared/ChatBotPanel.vue',
      'components/ui-mapping/CreateControl.vue',
      'pages/organization/models.vue'
    ]);
    const violations = vueFiles(['components', 'pages', 'layouts'])
      .filter(file => !['components/shared/InstanceSelect.vue', 'components/shared/InstanceMultiSelect.vue'].includes(file))
      .filter(file => !enumSelectAllowance.has(file))
      .filter(file => /from\s+['"]primevue\/(?:select|multiselect)['"]/.test(readFileSync(file, 'utf8')));

    expect(violations).toEqual([]);
  });

  it('renders the selected entity inside a normal full-width Select control', async () => {
    const html = await render(InstanceSelect, {
      modelValue: 'queue-2',
      options,
      optionLabel: 'label',
      optionValue: 'value',
      typeId: 'queue'
    });

    expect(html).toContain('data-entity-id="queue-2"');
    expect(html.match(/data-variant="option"/g)).toHaveLength(3);
    expect(html.match(/data-interactive="false"/g)).toHaveLength(3);
    expect(html).toContain('data-prime-select');
    expect(html).toContain('class="w-full"');
  });

  it('keeps unselected entity Select controls as ordinary full chooser controls', async () => {
    const html = await render(InstanceSelect, {
      modelValue: null,
      options,
      optionLabel: 'label',
      optionValue: 'value',
      typeId: 'queue'
    });

    expect(html).toMatch(/data-prime-value[^>]*><span>Choose<\/span><\/div>/);
  });

  it('renders selected entities as chips inside the control and options as rows', async () => {
    const html = await render(InstanceMultiSelect, {
      modelValue: ['queue-1', 'queue-2'],
      options,
      optionLabel: 'label',
      optionValue: 'value',
      typeId: 'queue'
    });

    expect(html.match(/data-variant="option"/g)).toHaveLength(2);
    expect(html.match(/data-entity-id="queue-1"/g)).toHaveLength(1);
    expect(html.match(/data-entity-id="queue-2"/g)).toHaveLength(1);
    // One chip per selected value inside the control's value area: the
    // glyph + label chip with its remove affordance.
    expect(html.match(/class="p-chip-label truncate"[^>]*>Queue [12]</g)).toHaveLength(2);
    expect(html.match(/p-chip-icon pi pi-circle/g)).toHaveLength(2);
    expect(html.indexOf('data-prime-value')).toBeLessThan(html.indexOf('data-entity-id'));
  });

  it('delegates ordinary option slots without entity-card rendering', async () => {
    const html = await render(InstanceSelect, {
      modelValue: 'DRAFT',
      options: [{ label: 'Draft', value: 'DRAFT' }],
      optionLabel: 'label',
      optionValue: 'value'
    }, {
      option: ({ option }) => h('strong', option.label)
    });

    expect(html).toContain('<strong>Draft</strong>');
    expect(html).not.toContain('data-entity-id');
  });

  it('recognizes §3 wire records as entity options', async () => {
    const wire = { _id: 'pen-1', name: 'Pen one', fields: { code: 'P1' }, state: 'active' };
    const html = await render(InstanceSelect, {
      modelValue: 'pen-1',
      options: [{ label: 'Pen one', value: 'pen-1', entity: wire, typeId: 'pen-template' }],
      optionLabel: 'label',
      optionValue: 'value'
    });

    expect(html).toContain('data-entity-id="pen-1"');
    expect(html).toContain('data-type-id="pen-template"');
    expect(html.match(/data-variant="option"/g)).toHaveLength(2);
  });

  it('derives picker options procedurally from an instance pool', () => {
    const types = [
      { id: 'cassette', identifier: 'name' },
      { id: 'pen', identifier: 'code' }
    ];
    const typeRecordFor = id => types.find(type => type.id === id);
    const pool = {
      cassette: { c1: { id: 'c1', type: 'cassette', fields: { name: 'Alpha' } } },
      pen: { p1: { id: 'p1', type: 'pen', fields: { code: 'P-1' } } }
    };

    const multi = instancePickerOptions(pool, ['cassette', 'pen'], {
      typeRecordFor,
      typeLabelFor: id => id.toUpperCase(),
      unnamedLabel: '?',
      refValue: true
    });
    expect(multi).toEqual([
      { label: 'CASSETTE: Alpha', value: { type: 'cassette', id: 'c1' }, entity: pool.cassette.c1, typeId: 'cassette' },
      { label: 'PEN: P-1', value: { type: 'pen', id: 'p1' }, entity: pool.pen.p1, typeId: 'pen' }
    ]);

    const single = instancePickerOptions(pool, ['pen'], { typeRecordFor, unnamedLabel: '?' });
    expect(single).toEqual([
      { label: 'P-1', value: 'p1', entity: pool.pen.p1, typeId: 'pen' }
    ]);
  });
});

function vueFiles(roots) {
  const files = [];
  const visit = path => {
    for (const name of readdirSync(path)) {
      const absolute = join(path, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (name.endsWith('.vue')) files.push(relative(process.cwd(), absolute));
    }
  };
  roots.forEach(visit);
  return files;
}
