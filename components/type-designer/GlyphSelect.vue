<template>
  <Button
    type="button"
    outlined
    severity="secondary"
    class="h-9 w-9 shrink-0 p-0"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    aria-haspopup="listbox"
    @click="event => picker?.toggle(event)"
  >
    <i :class="[modelValue || 'pi pi-circle', modelValue ? '' : 'text-muted']" aria-hidden="true" />
  </Button>
  <Popover ref="picker" @show="focusSearch" @hide="query = ''">
    <div class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" @keydown.esc.stop.prevent="picker?.hide()">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          ref="searchInput"
          v-model="query"
          size="small"
          class="w-full"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
        />
      </IconField>
      <div
        v-if="filteredOptions.length"
        class="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto p-1"
        role="listbox"
        :aria-label="ariaLabel"
      >
        <Button
          v-for="option in filteredOptions"
          :key="option.value || 'auto'"
          type="button"
          text
          severity="secondary"
          class="h-8 w-8 p-0"
          :class="option.value === (modelValue || '') ? 'bg-subtle' : ''"
          :aria-label="option.label || ariaLabel"
          :title="option.label || ariaLabel"
          :aria-selected="option.value === (modelValue || '')"
          role="option"
          @click="select(option.value)"
        >
          <i :class="[option.value || 'pi pi-circle', option.value ? '' : 'text-muted']" aria-hidden="true" />
        </Button>
      </div>
      <span v-else class="py-4 text-center text-muted text-supporting">{{ t('common.noResults') }}</span>
    </div>
  </Popover>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import { useI18n } from 'vue-i18n';
import { classGlyphOptions } from '~/components/type-designer/class-glyphs.js';

defineProps({
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const picker = ref(null);
const searchInput = ref(null);
const query = ref('');

const filteredOptions = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return classGlyphOptions;
  return classGlyphOptions.filter(option => option.search.includes(needle));
});

function focusSearch() {
  nextTick(() => {
    const input = searchInput.value?.$el || searchInput.value;
    input?.focus?.();
  });
}

function select(value) {
  emit('update:modelValue', String(value || ''));
  picker.value?.hide();
}
</script>
