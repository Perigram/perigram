import { createSSRApp, h } from 'vue';
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
          render('div', { 'data-prime-value': '' }, slots.value?.({ value: props.modelValue, placeholder: 'Choose' })),
          ...(props.options || []).map(option => slots.option?.({ option }))
        ]);
      }
    })
  };
});

vi.mock('~/components/shared/EntityInlineRef.vue', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      props: ['type', 'entity', 'variant', 'interactive'],
      setup(props) {
        return () => render('article', {
          'data-entity-id': props.entity?._id,
          'data-entity-type': props.type,
          'data-variant': props.variant,
          'data-interactive': String(props.interactive)
        });
      }
    })
  };
});

import EntitySelect from './EntitySelect.vue';
import EntityMultiSelect from './EntityMultiSelect.vue';

const entities = [
  { _id: 'queue-1', identity: { uid: 'queue-1', name: 'Queue 1' }, data: {} },
  { _id: 'queue-2', identity: { uid: 'queue-2', name: 'Queue 2' }, data: {} }
];
const options = entities.map(entity => ({ label: entity.identity.name, value: entity._id, entity }));

async function render(component, props, slots = {}) {
  return await renderToString(createSSRApp({ render: () => h(component, props, slots) }));
}

describe('entity Select wrappers', () => {
  it('owns every direct PrimeVue Select and MultiSelect import in app UI', () => {
    const violations = vueFiles(['components', 'pages', 'layouts'])
      .filter(file => !['components/shared/EntitySelect.vue', 'components/shared/EntityMultiSelect.vue'].includes(file))
      .filter(file => /from\s+['"]primevue\/(?:select|multiselect)['"]/.test(readFileSync(file, 'utf8')));

    expect(violations).toEqual([]);
  });

  it('renders the selected entity inside a normal full-width Select control', async () => {
    const html = await render(EntitySelect, {
      modelValue: 'queue-2',
      options,
      optionLabel: 'label',
      optionValue: 'value',
      entityType: 'queue'
    });

    expect(html).toContain('data-entity-id="queue-2"');
    expect(html.match(/data-variant="compact"/g)).toHaveLength(3);
    expect(html.match(/data-interactive="false"/g)).toHaveLength(3);
    expect(html).toContain('data-prime-select');
    expect(html).toContain('class="w-full"');
    expect(html).not.toContain('!w-10');
    expect(html).not.toContain('pi-pencil');
    expect(html).not.toContain('data-entity-selection');
  });

  it('keeps unselected entity Select controls as ordinary full chooser controls', async () => {
    const html = await render(EntitySelect, {
      modelValue: null,
      options,
      optionLabel: 'label',
      optionValue: 'value',
      entityType: 'queue'
    });

    expect(html).toMatch(/data-prime-value[^>]*><span>Choose<\/span><\/div>/);
    expect(html).not.toContain('!w-10');
    expect(html).not.toContain('data-entity-selection');
  });

  it('renders every selected entity outside MultiSelect as compact cards instead of chips', async () => {
    const html = await render(EntityMultiSelect, {
      modelValue: ['queue-1', 'queue-2'],
      options,
      optionLabel: 'label',
      optionValue: 'value',
      entityType: 'queue',
      display: 'chip'
    });

    expect(html.match(/data-entity-id="queue-1"/g)).toHaveLength(2);
    expect(html.match(/data-entity-id="queue-2"/g)).toHaveLength(2);
    expect(html).toContain('class="!w-10 shrink-0 self-start"');
    expect(html).toContain('aria-label="Queue 1, Queue 2"');
    expect(html).toMatch(/data-prime-value[^>]*><span class="pi pi-pencil" aria-hidden="true"><\/span><\/div>/);
    expect(html).not.toMatch(/data-prime-value[^>]*><span><\/span><\/div>/);
    expect(html.indexOf('data-entity-selection-list')).toBeLessThan(html.indexOf('data-prime-multiselect'));
  });

  it('delegates ordinary option slots without entity-card rendering', async () => {
    const html = await render(EntitySelect, {
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
