<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-page-title">{{ $t('uiMapping.title') }}</h1>
      <p class="text-body text-muted">
        {{ $t('uiMapping.intro') }}
      </p>
    </header>

    <Panel :header="$t('uiMapping.fields.header')">
      <div class="flex flex-col gap-6">
        <section v-for="type in bundle.types" :key="type.id" class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <i :class="type.render.icon" class="text-muted" />
            <span class="text-section-heading">{{ type.render.label }}</span>
            <Tag :value="type.class" severity="secondary" />
            <code class="text-technical text-muted">{{ type.id }}</code>
          </div>
          <div class="grid grid-cols-1 gap-x-8 gap-y-3 xl:grid-cols-2">
            <div class="flex flex-col gap-3">
              <span class="text-label">{{ $t('uiMapping.fields.editVariant') }}</span>
              <div v-for="[name, descriptor] in Object.entries(type.fields)" :key="`edit-${name}`" class="flex flex-col gap-1">
                <div class="flex items-baseline gap-2">
                  <span class="text-label">{{ name }}</span>
                  <code class="text-technical text-muted">{{ descriptorCaption(descriptor) }}</code>
                </div>
                <component
                  :is="editControl(descriptor)"
                  :value="demo[type.id]?.[name]"
                  :control-props="editControlProps(descriptor)"
                  :descriptor="descriptor"
                  :payload="type.payload"
                  :pool="pool"
                  @input="value => setDemo(type.id, name, value)"
                />
              </div>
            </div>
            <div class="flex flex-col gap-3">
              <span class="text-label">{{ $t('uiMapping.fields.displayVariant') }}</span>
              <div v-for="[name, descriptor] in Object.entries(type.fields)" :key="`row-${name}`" class="flex flex-col gap-1">
                <div class="flex items-baseline gap-2">
                  <span class="text-label">{{ name }}</span>
                  <code class="text-technical text-muted">{{ descriptorCaption(descriptor) }}</code>
                </div>
                <component
                  :is="displayControl(descriptor)"
                  :value="demo[type.id]?.[name]"
                  :control-props="displayControlProps(descriptor)"
                  :pool="pool"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </Panel>

    <Panel :header="$t('uiMapping.archetypes.header')">
      <div class="flex flex-col gap-6">
        <section v-for="entry in archetypeEntries" :key="entry.instance.id" class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <i :class="entry.type.render.icon" class="text-muted" />
            <span class="text-section-heading">{{ entry.type.render.label }}</span>
            <Tag :value="`${entry.type.class} · ${resolveSurfaceFor(entry.type, 'detail').archetype}`" severity="secondary" />
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div v-for="variant in ['inline', 'row', 'detail', 'full']" :key="variant" class="flex flex-col gap-2">
              <span class="text-supporting text-muted">{{ variant }} → {{ resolveSurfaceFor(entry.type, variant).component }}</span>
              <div class="bg-page flex min-h-16 items-start rounded-ui p-2">
                <component :is="surfaceComponent(entry.type, variant)" :instance="entry.instance" :variant="variant" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </Panel>

    <Panel :header="$t('uiMapping.nested.header')">
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-section-heading">{{ $t('uiMapping.nested.materialDetail') }}</span>
            <Tag :value="JSON.stringify(surfaceBudgets(materialType, 'detail').children)" severity="secondary" />
          </div>
          <component :is="surfaceComponent(materialType, 'detail')" :instance="instances.materials[0]" variant="detail" />
        </section>
        <section class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-section-heading">{{ $t('uiMapping.nested.partRows') }}</span>
            <Tag :value="JSON.stringify(surfaceBudgets(partType, 'row').relations)" severity="secondary" />
          </div>
          <div class="flex flex-col gap-2">
            <div v-for="part in instances.parts" :key="part.id" class="flex flex-col gap-1">
              <code class="text-technical text-muted">{{ part.fields.serial }} · {{ part.relations.drawings.length }} files</code>
              <component :is="surfaceComponent(partType, 'row')" :instance="part" variant="row" />
            </div>
          </div>
        </section>
        <section class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-section-heading">{{ $t('uiMapping.nested.openedPart') }}</span>
            <Tag :value="JSON.stringify(surfaceBudgets(partType, 'detail').relations)" severity="secondary" />
          </div>
          <component :is="surfaceComponent(partType, 'detail')" :instance="instances.parts[3]" variant="detail" />
        </section>
      </div>
    </Panel>

    <Panel :header="$t('uiMapping.actions.header')">
      <div class="flex flex-col gap-2">
        <div v-for="action in compiledActions" :key="action.id" class="flex flex-wrap items-center gap-3">
          <code class="text-technical w-44">{{ action.id }}</code>
          <Tag :value="action.actionKind" severity="secondary" />
          <Button
            v-if="!actionOutcome(action).hidden"
            :label="action.label"
            :severity="actionSeverity(action)"
            :outlined="actionOutcome(action).tone === 'secondary'"
            :text="actionOutcome(action).tone === 'text'"
            :icon="actionOutcome(action).icon || undefined"
            size="small"
          />
          <Tag v-else :value="$t('uiMapping.actions.hidden')" severity="warn" />
          <span v-if="actionOutcome(action).confirm" class="text-supporting text-muted">{{ $t('uiMapping.actions.confirmRequired') }}</span>
          <span v-if="actionOutcome(action).severity" class="text-supporting text-muted">{{ $t('uiMapping.actions.severity', { value: actionOutcome(action).severity }) }}</span>
        </div>
      </div>
    </Panel>

    <Panel :header="$t('uiMapping.chrome.header')">
      <div class="flex flex-col gap-4">
        <div v-for="row in chromeLadder" :key="row.label" class="flex flex-col gap-1">
          <code class="text-technical text-muted">{{ row.label }} → {{ chromeText(row.chrome) }}</code>
          <div :class="chromeClass(row.chrome)" class="flex flex-col gap-3">
            <span class="text-body">{{ row.label }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <code class="text-technical text-muted">{{ $t('uiMapping.chrome.flattenDemo') }}</code>
          <div :class="chromeClass(chromeFor('card'))" class="flex flex-col gap-3">
            <span class="text-body">{{ $t('uiMapping.chrome.card') }}</span>
            <div :class="chromeClass(chromeFor('card', 'card'))" class="flex flex-col gap-2">
              <span class="text-body">{{ $t('uiMapping.chrome.cardInCard') }}</span>
              <div :class="chromeClass(chromeFor('control'))" class="flex items-center gap-2">
                <span class="text-body">{{ $t('uiMapping.chrome.control') }}</span>
                <span class="text-supporting text-muted">{{ $t('uiMapping.chrome.inline') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup>
import { h, ref, reactive, resolveComponent } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import DatePicker from 'primevue/datepicker';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Panel from 'primevue/panel';
import {
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  resolveActionButton,
  resolveChrome,
  applyBudget
} from '#shared/ui-mapping/index.js';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from '~/test-data/ui-mapping-fixtures.js';

definePageMeta({ layout: 'ui-lab-layout' });

const bundle = createUiMappingClientBundle();
const contract = createUiMappingCompiledContract();
const instances = createUiMappingInstances();

const pool = {};
for (const group of Object.values(instances)) {
  for (const instance of group) {
    (pool[instance.type] ||= {})[instance.id] = instance;
  }
}
const typeById = Object.fromEntries(bundle.types.map(type => [type.id, type]));

const demo = reactive({});
for (const type of bundle.types) {
  const first = Object.values(pool[type.id] || {})[0];
  demo[type.id] = first ? JSON.parse(JSON.stringify(first.fields)) : {};
}
const setDemo = (typeId, name, value) => {
  if (demo[typeId]) demo[typeId][name] = value;
};

const startCaseText = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const descriptorCaption = descriptor => [
  descriptor.base,
  descriptor.unit ? `(${descriptor.unit})` : '',
  descriptor.accepts ? `(${descriptor.accepts.join(' | ')})` : '',
  descriptor.values ? `(${descriptor.values.length} values)` : '',
  descriptor.nullable ? '· nullable' : ''
].filter(Boolean).join(' ');

const PADDING_CLASS = { none: '', sm: 'p-2', md: 'p-4', lg: 'p-6' };
const chromeClass = chrome => [
  chrome.surface === 'page' ? 'bg-page' : '',
  chrome.surface === 'content' ? 'bg-content' : '',
  chrome.border === 'hairline' ? 'border border-content-border rounded-ui' : '',
  chrome.border === 'top' ? 'border-t border-content-border' : '',
  PADDING_CLASS[chrome.padding] || ''
].filter(Boolean);
const chromeText = chrome => `${chrome.flattened ? 'flattened ' : ''}${chrome.surface}/${chrome.padding}/${chrome.border}`;
const chromeFor = (role, parentRole = null) => resolveChrome(role, parentRole);

const quantityText = quantity => (quantity ? `${quantity.value} ${quantity.unit}` : '—');
const instantText = instant => (instant ? new Date(instant).toLocaleDateString() : '—');
const chipClass = 'inline-flex items-center gap-1 rounded-ui border border-content-border bg-subtle px-2 py-0.5 text-supporting';
const instanceLabel = instance => {
  if (!instance) return '?';
  const fields = instance.fields || {};
  return fields.serial || fields.title || fields.grade || fields.name || fields.summary || instance.id;
};
const severityOf = severity => ({ danger: 'danger', success: 'success', warning: 'warn', warn: 'warn', info: 'info' }[severity] || 'secondary');

const registry = {
  ValueText: ({ value }) => h('span', { class: 'text-body' }, value === null || value === undefined ? '—' : String(value)),
  QuantityText: ({ value }) => h('span', { class: 'text-technical' }, quantityText(value)),
  InstantText: ({ value }) => h('span', { class: 'text-technical' }, instantText(value)),
  BooleanIcon: ({ value }) => h('i', {
    class: value ? 'pi pi-check-circle text-status-success' : 'pi pi-minus-circle text-muted'
  }),
  Tag: ({ value }) => h(Tag, { value: value === null || value === undefined ? '—' : String(value), severity: 'secondary' }),
  EntityChip: ({ value, pool: entityPool }) => {
    if (!value) return h('span', { class: 'text-muted' }, '—');
    const instance = entityPool?.[value.type]?.[value.id];
    const type = typeById[value.type];
    return h('span', { class: chipClass }, [
      h('i', { class: type?.render?.icon || 'pi pi-circle' }),
      instanceLabel(instance)
    ]);
  },
  FileChip: ({ value }) => h('span', { class: chipClass }, [
    h('i', { class: 'pi pi-file' }),
    value?.mime || 'file'
  ]),
  ObjectSummary: ({ value }) => h('span', { class: 'text-supporting' },
    value && typeof value === 'object' ? Object.keys(value).slice(0, 3).join(', ') : '—'),
  ListSummary: ({ value }) => h('span', { class: 'text-supporting' },
    Array.isArray(value) ? `${value.length} items` : '—'),
  VariantTag: ({ value }) => h(Tag, { value: value?.tag || '—', severity: 'info' }),
  ImagePreview: ({ payload }) => h('div', { class: 'flex h-24 w-full items-center justify-center gap-2 rounded-ui bg-subtle text-supporting' }, [
    h('i', { class: 'pi pi-image' }),
    payload?.mime || 'image'
  ]),
  GeometryPreview: ({ payload }) => h('div', { class: 'flex h-24 w-full items-center justify-center gap-2 rounded-ui bg-subtle text-supporting' }, [
    h('i', { class: 'pi pi-objects-column' }),
    payload?.mime || 'geometry'
  ]),
  AttachmentPreview: ({ payload }) => h('div', { class: 'flex h-24 w-full items-center justify-center gap-2 rounded-ui bg-subtle text-supporting' }, [
    h('i', { class: 'pi pi-file' }),
    payload?.mime || 'attachment'
  ]),
  InputText: ({ value, onInput, controlProps = {} }) => h(InputText, { modelValue: value, 'onUpdate:modelValue': onInput, ...controlProps, class: 'w-full' }),
  Textarea: ({ value, onInput, controlProps = {} }) => h(Textarea, { modelValue: value, 'onUpdate:modelValue': onInput, ...controlProps, class: 'w-full', rows: 2 }),
  InputNumber: ({ value, onInput, controlProps = {} }) => h(InputNumber, {
    modelValue: typeof value === 'number' ? value : value?.value ?? null,
    'onUpdate:modelValue': number => onInput(typeof value === 'number'
      ? number
      : { value: number, unit: String(controlProps.suffix || '').trim() }),
    ...controlProps,
    class: 'w-full'
  }),
  ToggleSwitch: ({ value, onInput }) => h(ToggleSwitch, { modelValue: value === true, 'onUpdate:modelValue': onInput }),
  DatePicker: ({ value, onInput }) => h(DatePicker, { modelValue: value, 'onUpdate:modelValue': onInput, class: 'w-full' }),
  Select: ({ value, onInput, controlProps = {} }) => h(resolveComponent('Select'), {
    modelValue: value,
    options: (controlProps.options || []).map(option => ({ label: startCaseText(option), value: option })),
    optionLabel: 'label',
    optionValue: 'value',
    'onUpdate:modelValue': onInput,
    filter: controlProps.filter === true,
    class: 'w-full'
  }),
  EntityPicker: ({ value, onInput, controlProps = {}, pool: entityPool = {} }) => {
    const options = (controlProps.accepts || []).flatMap(typeId => Object.values(entityPool[typeId] || {}))
      .map(instance => ({ label: `${typeById[instance.type]?.render?.label || instance.type}: ${instanceLabel(instance)}`, value: { type: instance.type, id: instance.id } }));
    return h(resolveComponent('Select'), { modelValue: value, options, optionLabel: 'label', optionValue: 'value', 'onUpdate:modelValue': onInput, class: 'w-full' });
  },
  FileUpload: ({ payload = null }) => h('div', { class: 'flex items-center gap-2' }, [
    h(Button, { icon: 'pi pi-upload', label: 'Upload', size: 'small', severity: 'secondary', outlined: true }),
    h('span', { class: 'text-supporting text-muted' },
      `${(payload?.accept || []).join(' ')} · ${Math.round((payload?.maxSize || 0) / 1024 / 1024)} MB`)
  ]),
  ObjectEditor: ({ value, onInput, descriptor, payload = null, pool: entityPool }) => {
    const fields = descriptor?.fields || {};
    const current = value && typeof value === 'object' ? value : {};
    return h('div', { class: 'flex flex-col gap-2 rounded-ui border border-content-border p-2' },
      Object.entries(fields).map(([name, sub]) => {
        const outcome = resolveFieldControl(sub, { variant: 'detail' });
        return h('div', { key: name, class: 'flex flex-col gap-1' }, [
          h('span', { class: 'text-label' }, name),
          h(registry[outcome.component], {
            value: current[name],
            onInput: next => onInput({ ...current, [name]: next }),
            controlProps: outcome.props,
            descriptor: sub,
            payload,
            pool: entityPool
          })
        ]);
      }));
  },
  ListEditor: ({ value, onInput, descriptor, payload = null, pool: entityPool }) => {
    const items = Array.isArray(value) ? value : [];
    const item = descriptor?.itemType || { base: 'string' };
    const outcome = resolveFieldControl(item, { variant: 'detail' });
    const blank = () => (item.base === 'string' ? '' : item.base === 'number' ? 0 : item.base === 'quantity' ? { value: 0, unit: item.unit } : {});
    return h('div', { class: 'flex flex-col gap-2' }, [
      ...items.map((entry, index) => h('div', { key: index, class: 'flex items-center gap-2' }, [
        h('div', { class: 'flex-1' }, [
          h(registry[outcome.component], {
            value: entry,
            onInput: next => onInput(items.map((candidate, position) => (position === index ? next : candidate))),
            controlProps: outcome.props,
            descriptor: item,
            payload,
            pool: entityPool
          })
        ]),
        h(Button, { icon: 'pi pi-times', text: true, size: 'small', onClick: () => onInput(items.filter((_, position) => position !== index)) })
      ])),
      h(Button, { icon: 'pi pi-plus', label: 'Add', size: 'small', text: true, onClick: () => onInput([...items, blank()]) })
    ]);
  },
  VariantEditor: ({ value, onInput, descriptor, payload = null, pool: entityPool }) => {
    const current = value || { tag: descriptor?.tags?.[0], value: null };
    const payloadDescriptor = descriptor?.payloads?.[current.tag];
    const outcome = payloadDescriptor ? resolveFieldControl(payloadDescriptor, { variant: 'detail' }) : null;
    return h('div', { class: 'flex flex-col gap-2' }, [
      h(resolveComponent('Select'), {
        modelValue: current.tag,
        options: (descriptor?.tags || []).map(tag => ({ label: startCaseText(tag), value: tag })),
        optionLabel: 'label',
        optionValue: 'value',
        'onUpdate:modelValue': tag => onInput({ tag, value: null }),
        class: 'w-full'
      }),
      outcome ? h(registry[outcome.component], {
        value: current.value,
        onInput: next => onInput({ ...current, value: next }),
        controlProps: outcome.props,
        descriptor: payloadDescriptor,
        payload,
        pool: entityPool
      }) : null
    ]);
  }
};

const editOutcome = descriptor => resolveFieldControl(descriptor, { variant: 'detail' });
const editControl = descriptor => registry[editOutcome(descriptor).component];
const editControlProps = descriptor => editOutcome(descriptor).props;
const displayOutcome = descriptor => resolveFieldControl(descriptor, { variant: 'row' });
const displayControl = descriptor => registry[displayOutcome(descriptor).component];
const displayControlProps = descriptor => displayOutcome(descriptor).props;

const expanded = ref({});

const SurfaceBody = ({ instance, variant = 'detail', parentRole = null }) => {
  const type = typeById[instance.type];
  const surface = resolveSurface(type, { variant });
  const role = variant === 'full' ? 'section' : variant === 'detail' ? 'card' : 'inline';
  const chrome = resolveChrome(role, parentRole);
  const layout = variant === 'row' || variant === 'inline'
    ? 'flex flex-wrap items-center gap-2'
    : 'flex flex-col gap-3';

  const identitySlot = h('span', { class: 'inline-flex items-center gap-2' }, [
    h('i', { class: type.render.icon }),
    h('span', { class: variant === 'row' || variant === 'inline' ? 'text-body' : 'text-section-heading' }, instanceLabel(instance))
  ]);

  const statusValue = instance.states?.main;
  const stateRender = statusValue ? type.render.states?.[statusValue] : null;
  const statusSlot = statusValue
    ? h(Tag, { value: stateRender?.label || startCaseText(statusValue), severity: severityOf(stateRender?.severity) })
    : null;

  const fieldSlots = surface.slots.includes('fields')
    ? Object.entries(type.fields).slice(0, variant === 'row' ? 3 : 99).map(([name, descriptor]) => {
        const outcome = resolveFieldControl(descriptor, { variant: 'row' });
        return h(registry[outcome.component], { key: name, value: instance.fields?.[name], controlProps: outcome.props, pool });
      })
    : [];

  const previewSlot = surface.slots.includes('preview')
    ? h(registry[resolvePreview(type).component], { payload: instance.payload })
    : null;

  const budgetList = (list, budget, expandKey) => {
    const outcome = applyBudget(list, budget);
    const isOpen = budget?.overflow === 'more' && expanded.value[expandKey];
    const shown = isOpen ? list : outcome.visible;
    return { outcome, isOpen, shown };
  };

  const relationSlots = surface.slots.includes('relations')
    ? Object.entries(instance.relations || {}).map(([key, refs]) => {
        const budget = surface.budgets[key];
        const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
        const { outcome, isOpen, shown } = budgetList(list, budget, `${instance.id}:${key}`);
        const chips = shown.map(ref => h(registry.EntityChip, { key: ref.id, value: ref, pool }));
        if (outcome.mode === 'scroll') {
          return h('div', { key, class: 'flex max-h-48 flex-wrap gap-2 overflow-y-auto' }, chips);
        }
        const parts = [...chips];
        if (outcome.mode === 'collapsed' && outcome.hidden > 0 && budget.overflow === 'count') {
          parts.push(h(Tag, { key: 'more', value: `+${outcome.hidden}`, severity: 'contrast' }));
        }
        if (budget?.overflow === 'more' && outcome.hidden > 0) {
          parts.push(h(Button, {
            key: 'toggle',
            label: isOpen ? 'Show less' : `Show ${outcome.hidden} more`,
            size: 'small',
            text: true,
            onClick: () => { expanded.value[`${instance.id}:${key}`] = !isOpen; }
          }));
        }
        return h('div', { key, class: 'flex flex-wrap items-center gap-2' }, parts);
      })
    : [];

  const childrenSlot = surface.slots.includes('children')
    ? (() => {
        const edgeKey = Object.keys(type.edges?.children || {})[0];
        if (!edgeKey) return null;
        const kids = Object.values(pool).flatMap(byId => Object.values(byId))
          .filter(candidate => candidate.lineage?.[edgeKey]?.id === instance.id);
        const budget = surface.budgets.children;
        const { outcome, isOpen, shown } = budgetList(kids, budget, `${instance.id}:children`);
        const rows = shown.map(kid => h(SurfaceBody, { key: kid.id, instance: kid, variant: 'row', parentRole: role }));
        if (outcome.mode === 'scroll') {
          return h('div', { class: 'flex max-h-64 flex-col gap-2 overflow-y-auto' }, rows);
        }
        const parts = [...rows];
        if (outcome.mode === 'collapsed' && outcome.hidden > 0 && budget.overflow === 'count') {
          parts.push(h(Tag, { value: `+${outcome.hidden}`, severity: 'contrast' }));
        }
        if (budget?.overflow === 'more' && outcome.hidden > 0) {
          parts.push(h(Button, {
            label: isOpen ? 'Show less' : `Show ${outcome.hidden} more`,
            size: 'small',
            text: true,
            onClick: () => { expanded.value[`${instance.id}:children`] = !isOpen; }
          }));
        }
        return h('div', { class: 'flex flex-col gap-2' }, parts);
      })()
    : null;

  const content = [identitySlot, statusSlot, previewSlot, ...fieldSlots, ...relationSlots, childrenSlot].filter(Boolean);
  return h('div', { class: [...chromeClass(chrome), layout].join(' ') }, content);
};

const surfaceVariants = {
  ItemRow: 'row',
  ProcessRow: 'row',
  GroupRow: 'row',
  FileRow: 'row',
  ItemCard: 'detail',
  ProcessCard: 'detail',
  CollectionCard: 'detail',
  FileCard: 'detail',
  RecordSurface: 'detail',
  ItemSheet: 'full',
  ProcessSurface: 'full',
  CollectionSurface: 'full',
  FileViewerSurface: 'full'
};
for (const [key, variant] of Object.entries(surfaceVariants)) {
  registry[key] ||= props => h(SurfaceBody, { ...props, variant });
}

const materialType = typeById.material;
const partType = typeById.part;
const surfaceComponent = (type, variant) => registry[resolveSurface(type, { variant }).component];
const resolveSurfaceFor = (type, variant) => resolveSurface(type, { variant });
const surfaceBudgets = (type, variant) => resolveSurface(type, { variant }).budgets;

const archetypeEntries = [
  { type: typeById.part, instance: instances.parts[1] },
  { type: typeById.material, instance: instances.materials[0] },
  { type: typeById.nesting_job, instance: instances.jobs[0] },
  { type: typeById.drawing, instance: instances.drawings[0] }
];

const compiledActions = Object.values(contract.actions);
const partRender = typeById.part.render;
const actionOutcome = action => resolveActionButton(action, { render: partRender });
const actionSeverity = action => {
  const outcome = actionOutcome(action);
  return outcome.severity || (outcome.tone === 'danger' ? 'danger' : outcome.tone === 'primary' ? undefined : 'secondary');
};

const chromeLadder = [
  { label: 'canvas', chrome: chromeFor('canvas') },
  { label: 'section > card', chrome: chromeFor('card', 'section') },
  { label: 'section > section (spacing only)', chrome: chromeFor('section', 'section') },
  { label: 'control', chrome: chromeFor('control') },
  { label: 'inline', chrome: chromeFor('inline') }
];
</script>
