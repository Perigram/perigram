<template>
  <StandardDialog
    :visible="modelValue"
    size="sm"
    :header="$t('cassetteDesign.configure')"
    :show-default-footer="true"
    :save-label="$t('common.save')"
    :cancel-label="$t('common.cancel')"
    :loading="saving"
    @update:visible="emit('update:modelValue', $event)"
    @save="save"
    @cancel="emit('update:modelValue', false)"
  >
    <div class="flex flex-col gap-3">
      <label v-if="nameField" class="flex flex-col gap-1">
        <span class="text-xs text-muted-color">{{ nameField.label || $t('common.name') }}</span>
        <InputText v-model="name" size="small" />
      </label>
      <label v-for="parameter in parameterNames" :key="parameter" class="flex flex-col gap-1">
        <span class="text-xs text-muted-color">{{ parameter }}</span>
        <InputNumber v-model="parameters[parameter]" fluid size="small" />
      </label>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { occsParameterNames } from '~/utils/occs/parameters.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  action: { type: Object, required: true },
  design: { type: Object, required: true },
  template: { type: Object, required: true },
  queue: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue', 'saved']);
const { t } = useI18n();
const toast = useToast();
const saving = ref(false);
const name = ref('');
const parameters = reactive({});
const creatorFields = computed(() => props.action?.relationMutation?.creator?.inputPolicy?.fields || []);
const nameField = computed(() => creatorFields.value.find(field => field.id === 'name') || null);
const parameterNames = computed(() => occsParameterNames(props.template?.data?.definition || {}));

watch(() => props.modelValue, visible => {
  if (!visible) return;
  name.value = props.design.identity?.name || '';
  const current = props.design.data?.parameters || props.design.provenance?.derivedFrom?.parameters || {};
  const definitions = props.template.data?.definition?.parameters || {};
  for (const key of Object.keys(parameters)) delete parameters[key];
  for (const key of parameterNames.value) {
    const definition = definitions[key] || {};
    const value = current[key] ?? definition.default ?? definition.value ?? definition.min ?? 0;
    parameters[key] = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
}, { immediate: true });

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const actionId = props.action.actionId || props.action.id;
    const queueId = props.queue._id || props.queue.identity?.uid;
    const designId = props.design._id || props.design.identity?.uid;
    const templateId = props.template._id || props.template.identity?.uid;
    const result = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: {
        entityId: queueId,
        entities: { queue: queueId },
        data: {
          relationCreator: {
            ...(nameField.value && name.value ? { name: name.value } : {}),
            templateId,
            parameters: { ...parameters }
          },
          relationReplaces: { type: props.action.relationMutation.targetType, id: designId }
        }
      }
    });
    emit('saved', result?.created || result);
    emit('update:modelValue', false);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: error?.data?.message || error?.message || t('generatedScreen.actionFailed'),
      life: 4000
    });
  } finally {
    saving.value = false;
  }
}
</script>
