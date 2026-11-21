<template>
  <!-- The file panel body (SPEC §4): the edited document's identity row —
       name with in-place rename, the diverged refresh, the dirty-marked
       save — rendered from the editor-page chrome api the editor bound. -->
  <div class="flex min-w-0 items-center gap-2 px-3 py-2">
    <i class="pi pi-file shrink-0 text-supporting text-muted" aria-hidden="true" />
    <InputText
      v-if="renameable"
      v-model="nameValue"
      class="min-w-0 flex-1"
      size="small"
      :pt="nameFieldPt"
      :placeholder="$t('common.unnamed')"
      :aria-label="$t('common.rename')"
      @keydown.enter.prevent.stop="commitName"
      @blur="commitName"
    />
    <span v-else class="min-w-0 flex-1 truncate text-label">{{ name }}</span>
    <Button
      v-if="chromeApi.diverged"
      icon="pi pi-refresh"
      text
      rounded
      size="small"
      severity="secondary"
      :aria-label="$t('common.refresh')"
      :title="$t('common.refresh')"
      @click="chromeApi.reload?.()"
    />
    <Button
      v-if="chromeApi.save"
      :label="$t('common.save')"
      icon="pi pi-save"
      size="small"
      text
      severity="secondary"
      :loading="chromeApi.saving"
      :disabled="!chromeApi.dirty"
      @click="chromeApi.save()"
    />
    <Button
      v-if="chromeApi.apply"
      :label="$t('processDesigner.apply')"
      icon="pi pi-check"
      size="small"
      text
      severity="secondary"
      :loading="chromeApi.applyBusy"
      :disabled="!chromeApi.canApply"
      @click="chromeApi.apply()"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

const props = defineProps({
  // The bound editor-page chrome api: `{ name, dirty, saving, diverged,
  // save(), rename(), reload() }` with reactive values.
  chromeApi: { type: Object, required: true }
});

const chromeApi = computed(() => props.chromeApi || {});
const renameable = computed(() => typeof chromeApi.value.rename === 'function');
const name = computed(() => chromeApi.value.name || '');
const nameValue = ref(name.value);
watch(name, value => {
  if (nameValue.value !== value) nameValue.value = value;
});

function commitName() {
  const next = String(nameValue.value || '').trim();
  if (!next || next === name.value) {
    nameValue.value = name.value;
    return;
  }
  chromeApi.value.rename?.(next);
}

// The name field reads as a title: the border appears on focus/hover
// alone, so the row is a document headline with an edit affordance.
const nameFieldPt = {
  root: {
    class: 'border-transparent bg-transparent hover:border-[var(--p-inputtext-hover-border-color)] focus:border-[var(--p-inputtext-focus-border-color)]'
  }
};
</script>
