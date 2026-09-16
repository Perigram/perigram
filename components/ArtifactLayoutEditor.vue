<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="overflow-auto rounded-ui border border-content-border p-3">
      <svg
        v-if="activePage"
        class="h-auto min-h-80 w-full"
        :viewBox="viewBox"
        role="img"
        :aria-label="$t('artifactTemplates.layout')"
      >
        <rect :x="pageX" :y="pageY" :width="pageWidth" :height="pageHeight" fill="white" stroke="currentColor" opacity="0.9" />
        <g :transform="`translate(0 ${pageY * 2 + pageHeight}) scale(1 -1)`">
          <g
            v-for="item in visibleItems"
            :key="item.id"
            :transform="`translate(${item.offset?.x || 0} ${item.offset?.y || 0})`"
            class="cursor-pointer"
            :opacity="selectedItem?.id === item.id ? 1 : 0.72"
            @click="selectedItemId = item.id"
          >
            <polyline
              v-if="item.geometry?.points?.length > 1"
              :points="item.geometry.points.map(point => point.join(',')).join(' ')"
              fill="none"
              :stroke="selectedItem?.id === item.id ? 'var(--p-primary-color)' : 'currentColor'"
              vector-effect="non-scaling-stroke"
            />
            <rect
              v-else
              :x="item.x"
              :y="item.y"
              :width="Math.max(item.width || 0, pageWidth / 200)"
              :height="Math.max(item.height || 0, pageHeight / 100)"
              fill="none"
              :stroke="selectedItem?.id === item.id ? 'var(--p-primary-color)' : 'currentColor'"
              vector-effect="non-scaling-stroke"
            />
            <!-- Data-driven exception: saved document typography controls canvas geometry. -->
            <text
              v-if="item.kind === 'text'"
              :x="item.x"
              :y="item.y"
              :font-size="item.fontSize || 10"
              fill="currentColor"
              transform="scale(1 -1)"
              :transform-origin="`${item.x}px ${item.y}px`"
            >{{ item.variable?.default ?? item.text }}</text>
          </g>
        </g>
      </svg>
    </div>

    <div class="flex flex-col gap-3">
      <Select
        v-if="pages.length > 1"
        v-model="activePageNumber"
        :options="pageOptions"
        option-label="label"
        option-value="value"
        size="small"
      />
      <Select
        v-model="selectedItemId"
        :options="itemOptions"
        option-label="label"
        option-value="value"
        size="small"
      />
      <template v-if="selectedItem">
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-muted text-supporting">{{ $t('artifactTemplates.moveX') }}</span>
            <InputNumber v-model="selectedItem.offset.x" size="small" :max-fraction-digits="3" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-muted text-supporting">{{ $t('artifactTemplates.moveY') }}</span>
            <InputNumber v-model="selectedItem.offset.y" size="small" :max-fraction-digits="3" />
          </label>
        </div>
        <label class="flex items-center gap-2">
          <Checkbox v-model="selectedItem.deleted" binary />
          <span>{{ $t('artifactTemplates.deleted') }}</span>
        </label>
        <template v-if="selectedItem.kind === 'text'">
          <label class="flex items-center gap-2">
            <Checkbox v-model="parameterized" binary />
            <span>{{ $t('artifactTemplates.parameterized') }}</span>
          </label>
          <template v-if="selectedItem.variable">
            <label class="flex flex-col gap-1">
              <span class="text-muted text-supporting">{{ $t('artifactTemplates.variableName') }}</span>
              <InputText v-model="selectedItem.variable.name" size="small" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-muted text-supporting">{{ $t('artifactTemplates.variableType') }}</span>
              <Select v-model="selectedItem.variable.type" :options="variableTypes" option-label="label" option-value="value" size="small" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-muted text-supporting">{{ $t('artifactTemplates.defaultValue') }}</span>
              <InputText v-model="selectedItem.variable.default" size="small" />
            </label>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/EntitySelect.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  modelValue: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const localLayout = ref(clone(props.modelValue));
const activePageNumber = ref(1);
const selectedItemId = ref('');
const pages = computed(() => localLayout.value?.pages || []);
const activePage = computed(() => pages.value.find(page => Number(page.number) === Number(activePageNumber.value)) || pages.value[0] || null);
const pageWidth = computed(() => Math.max(1, Number(activePage.value?.width || 1)));
const pageHeight = computed(() => Math.max(1, Number(activePage.value?.height || 1)));
const pageX = computed(() => Number(activePage.value?.x || 0));
const pageY = computed(() => Number(activePage.value?.y || 0));
const viewBox = computed(() => `${pageX.value} ${pageY.value} ${pageWidth.value} ${pageHeight.value}`);
const visibleItems = computed(() => (activePage.value?.items || []).filter(item => !item.deleted));
const selectedItem = computed(() => (activePage.value?.items || []).find(item => item.id === selectedItemId.value) || null);
const pageOptions = computed(() => pages.value.map(page => ({ label: t('artifactTemplates.page', { number: page.number }), value: page.number })));
const itemOptions = computed(() => (activePage.value?.items || []).map(item => ({
  label: item.kind === 'text' ? (item.text || item.id) : `${item.entityType} · ${item.id}`,
  value: item.id
})));
const variableTypes = computed(() => [
  { label: t('artifactTemplates.string'), value: 'string' },
  { label: t('artifactTemplates.number'), value: 'number' },
  { label: t('artifactTemplates.boolean'), value: 'boolean' }
]);
const parameterized = computed({
  get: () => Boolean(selectedItem.value?.variable),
  set: (enabled) => {
    if (!selectedItem.value) return;
    selectedItem.value.variable = enabled
      ? { name: '', type: 'string', required: false, default: selectedItem.value.text || '' }
      : null;
  }
});

watch(() => props.modelValue, value => {
  localLayout.value = clone(value);
  activePageNumber.value = localLayout.value?.pages?.[0]?.number || 1;
  selectedItemId.value = localLayout.value?.pages?.[0]?.items?.[0]?.id || '';
}, { deep: true, immediate: true });

watch(localLayout, value => emit('update:modelValue', clone(value)), { deep: true });
watch(activePage, page => {
  if (!(page?.items || []).some(item => item.id === selectedItemId.value)) selectedItemId.value = page?.items?.[0]?.id || '';
});

function clone(value) {
  return JSON.parse(JSON.stringify(value || { pages: [] }));
}
</script>
