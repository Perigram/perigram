<template>
  <div v-if="output" class="flex flex-col gap-2 border-t border-surface pt-3" data-graph-output-bake>
    <strong class="text-supporting">{{ $t('processDesigner.bakeOutput') }}</strong>
    <label class="text-supporting text-muted" for="graph-bake-page">{{ $t('processDesigner.pageDestination') }}</label>
    <InstanceSelect
      id="graph-bake-page"
      v-model="selectedPageId"
      :options="pageOptions"
      option-label="label"
      option-value="_id"
      :aria-label="$t('processDesigner.pageDestination')"
      class="w-full"
      :placeholder="$t('processDesigner.selectPage')"
    />
    <label class="text-supporting text-muted" for="graph-bake-path">{{ $t('processDesigner.pageFilePath') }}</label>
    <InputText id="graph-bake-path" v-model="pageFilePath" class="w-full" placeholder="exports/result.json" />
    <label class="text-supporting text-muted" for="graph-bake-conflict">{{ $t('processDesigner.conflictPolicy') }}</label>
    <InstanceSelect
      id="graph-bake-conflict"
      v-model="conflictPolicy"
      :options="conflictOptions"
      option-label="label"
      option-value="value"
      :aria-label="$t('processDesigner.conflictPolicy')"
      class="w-full"
    />
    <Button
      size="small"
      icon="pi pi-file-export"
      :label="$t('processDesigner.bakeOutput')"
      :disabled="!canBake"
      :loading="baking"
      @click="submitBake"
    />
    <Message v-if="!canBake && execution?.status === 'succeeded' && !canBakeToSavedGraph" severity="warn">
      {{ $t('processDesigner.bakeRequiresSaved') }}
    </Message>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';

const props = defineProps({
  output: { type: Object, default: null },
  execution: { type: Object, default: null },
  canBakeToSavedGraph: { type: Boolean, default: false },
  baking: { type: Boolean, default: false }
});
const emit = defineEmits(['bake']);

const { t } = useI18n();
const selectedPageId = ref('');
const pageFilePath = ref('exports/result.json');
const conflictPolicy = ref('fail');
const pageOptions = ref([]);
const conflictOptions = computed(() => [
  { value: 'fail', label: t('processDesigner.bakeConflictFail') },
  { value: 'create-revision', label: t('processDesigner.bakeConflictRevision') },
  { value: 'replace', label: t('processDesigner.bakeConflictReplace') },
  { value: 'create-distinct-name', label: t('processDesigner.bakeConflictDistinct') }
]);
const canBake = computed(() => Boolean(
  props.canBakeToSavedGraph
  && props.execution?.status === 'succeeded'
  && props.execution?.profile === 'procedural-preview'
  && props.output?.id
  && selectedPageId.value
  && pageFilePath.value.trim()
  && !props.baking
));

function submitBake() {
  if (!canBake.value) return;
  emit('bake', {
    outputId: props.output.id,
    pageId: selectedPageId.value,
    path: pageFilePath.value.trim(),
    conflictPolicy: conflictPolicy.value,
    execution: props.execution
  });
}

onMounted(async () => {
  try {
    const response = await $fetch('/api/pages');
    const pages = (Array.isArray(response?.pages) ? response.pages : [])
      .filter(page => page?.kind === 'page' && page?._id);
    const byId = new Map(pages.map(page => [String(page._id), page]));
    pageOptions.value = pages.map(page => {
      const parts = [];
      const seen = new Set();
      let current = page;
      while (current && !seen.has(String(current._id))) {
        seen.add(String(current._id));
        parts.unshift(String(current.name || t('pages.page')));
        current = current.parentId ? byId.get(String(current.parentId)) : null;
      }
      return { _id: String(page._id), label: parts.join(' / ') };
    });
  } catch {
    pageOptions.value = [];
  }
});
</script>
