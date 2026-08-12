<template>
  <Panel
    class="queue-entry-card cursor-pointer"
    :class="selected ? 'border-primary bg-subtle' : ''"
    :pt="panelPt"
    @click="emit('select')"
  >
    <div class="queue-entry-card__layout flex min-w-0 flex-col gap-2">
      <CassetteThumbnail
        v-if="cassette"
        class="queue-entry-card__preview min-w-0"
        :cassette-id="sourceId"
        :cassette="cassette"
        :dimensions="entry.dimensions"
        fixed-frame
      />

      <div class="queue-entry-card__content flex min-w-0 flex-col gap-2">
        <div class="group flex min-w-0 items-center justify-between gap-2">
          <EntityInlineRef
            v-if="template || templateId"
            type="cassetteTemplate"
            :id="templateId"
            :entity="template"
            :fetch="false"
            :interactive="false"
          />
          <Tag v-else :value="sourceLabel" severity="secondary" />
          <div class="flex shrink-0 items-center gap-1" data-entity-card-interactive="true" @click.stop>
            <small class="text-muted-color">{{ $t('common.quantity') }}</small>
            <InputNumber
              :model-value="entry.quantity"
              :min="1"
              :disabled="disabled"
              size="small"
              class="w-16"
              :aria-label="$t('common.quantity')"
              @update:model-value="value => emit('update-quantity', value)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              :aria-label="$t('common.delete')"
              v-tooltip.top="$t('common.delete')"
              :disabled="disabled"
              @click="emit('remove')"
            />
          </div>
        </div>

        <section v-if="parameterNames.length" class="flex flex-col gap-2" aria-labelledby="queue-entry-parameters">
          <div class="flex flex-wrap items-center gap-1">
            <small id="queue-entry-parameters" class="text-muted-color">{{ $t('cassette.parameters') }}</small>
            <Tag v-if="units" :value="units" severity="secondary" size="small" />
            <Tag
              :value="configurable ? $t('queue.parametersConfigurable') : $t('queue.parametersLocked')"
              :severity="configurable ? 'success' : 'secondary'"
              size="small"
            />
          </div>
          <div class="queue-entry-card__parameters grid gap-2">
            <label v-for="parameter in parameterNames" :key="parameter" class="flex items-center gap-2">
              <small class="min-w-6 text-muted-color">{{ parameter }}</small>
              <InputNumber
                v-model="draftParameters[parameter]"
                :disabled="disabled || !configurable || lockedParameters.includes(parameter)"
                size="small"
                fluid
              />
              <Tag
                v-if="lockedParameters.includes(parameter)"
                :value="$t('queue.parameterLocked')"
                severity="secondary"
                size="small"
              />
            </label>
            <Button
              v-if="configurable && parametersChanged"
              icon="pi pi-check"
              severity="secondary"
              size="small"
              :label="$t('common.save')"
              :loading="saving"
              :disabled="disabled"
              @click="emit('configure', { ...draftParameters })"
            />
          </div>
        </section>
        <div v-if="selected" class="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-color" data-queue-entry-context>
          <Tag :value="designContextLabel" severity="secondary" size="small" />
          <i v-if="template || templateId" class="pi pi-arrow-right text-xs" aria-hidden="true" />
          <Tag v-if="template || templateId" :value="$t('queue.sourceTemplate')" severity="secondary" size="small" />
          <Tag v-else :value="$t('queue.sourceUnavailable')" severity="warn" size="small" />
        </div>
        <div v-if="selected && (canOpenDesign || canOpenTemplate)" class="flex flex-wrap items-center gap-1" data-entity-card-interactive="true" @click.stop>
          <Button
            v-if="canOpenDesign"
            :label="$t('queue.inspectDesign')"
            icon="pi pi-eye"
            severity="secondary"
            text
            size="small"
            @click="emit('open-design')"
          />
          <Button
            v-if="canOpenTemplate"
            :label="$t('queue.openTemplate')"
            icon="pi pi-pencil"
            severity="secondary"
            text
            size="small"
            @click="emit('open-template')"
          />
        </div>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Tag from 'primevue/tag';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const props = defineProps({
  entry: { type: Object, required: true },
  cassette: { type: Object, default: null },
  template: { type: Object, default: null },
  templateId: { type: String, default: '' },
  parameters: { type: Array, default: () => [] },
  units: { type: String, default: '' },
  lockedParameters: { type: Array, default: () => ['T'] },
  configurable: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  canOpenDesign: { type: Boolean, default: false },
  canOpenTemplate: { type: Boolean, default: false }
});

const emit = defineEmits(['configure', 'update-quantity', 'remove', 'select', 'open-design', 'open-template']);
const { t } = useI18n();
const panelPt = {
  header: { class: '!hidden' },
  content: { class: '!p-2' }
};

const sourceId = computed(() => props.entry.id);
const parameterNames = computed(() => props.parameters);
const draftParameters = reactive({});
const sourceParameters = computed(() => props.cassette?.data?.parameters
  || props.cassette?.provenance?.derivedFrom?.parameters
  || {});
const parametersChanged = computed(() => parameterNames.value.some(parameter => (
  Number(draftParameters[parameter]) !== Number(sourceParameters.value[parameter])
)));

watch([sourceParameters, parameterNames], ([values, names]) => {
  for (const key of Object.keys(draftParameters)) delete draftParameters[key];
  const definitions = props.template?.data?.definition?.parameters || {};
  for (const name of names) {
    const definition = definitions[name] || {};
    const value = values[name] ?? definition.default ?? definition.value ?? definition.min ?? 0;
    draftParameters[name] = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
}, { immediate: true });
const sourceTypeLabel = computed(() => {
  if (props.entry.entityType === 'cassette') return t('entities.cassette');
  if (props.entry.entityType === 'cassette_design') return t('entities.cassetteDesign');
  return props.entry.entityType || t('entities.cassetteDesign');
});
const sourceLabel = computed(() => `${sourceTypeLabel.value}: ${sourceId.value || t('common.unknown')}`);
const designContextLabel = computed(() => `${sourceTypeLabel.value}: ${sourceId.value || t('common.unknown')}`);
</script>

<style scoped>
.queue-entry-card {
  container-type: inline-size;
  width: 100%;
  max-width: var(--ck-bounded-grid-item-max-width);
}

.queue-entry-card__preview {
  width: var(--ck-compact-preview-width);
  max-width: var(--ck-compact-preview-width);
}

.queue-entry-card__parameters {
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
}

@container (min-width: 28rem) {
  .queue-entry-card__layout {
    display: grid;
    grid-template-columns: var(--ck-compact-preview-width) minmax(0, 1fr);
    align-items: start;
  }
}
</style>
