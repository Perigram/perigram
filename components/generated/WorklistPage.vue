<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 py-3">
      <h2 class="m-0 text-lg font-semibold">{{ $t('worklist.title') }}</h2>
      <Button
        icon="pi pi-refresh"
        text
        rounded
        size="small"
        severity="secondary"
        :loading="loading"
        :aria-label="$t('common.refresh')"
        @click="load"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <div
        v-if="!loading && !items.length"
        class="flex h-full flex-col items-center justify-center gap-2 text-muted"
      >
        <i class="pi pi-check-circle text-xl" aria-hidden="true" />
        <span>{{ $t('worklist.empty') }}</span>
      </div>
      <div v-else class="flex flex-col gap-2">
        <button
          v-for="item in items"
          :key="`${item.typeId}:${item.id}`"
          type="button"
          class="flex items-center gap-3 rounded-ui border border-subtle bg-surface px-3 py-2 text-left transition-colors hover:bg-subtle"
          @click="open(item)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ item.name || $t('common.unnamed') }}</span>
            <span class="block truncate text-supporting text-muted">{{ typeLabel(item.typeId) }} · {{ item.state }}</span>
          </span>
          <span v-if="item.actions.length" class="hidden max-w-40 truncate text-supporting text-muted sm:block">
            {{ item.actions.map(action => action.label).filter(Boolean).join(', ') }}
          </span>
          <Tag v-if="item.overdue" :value="$t('worklist.overdue')" severity="danger" size="small" />
          <span v-else-if="item.dueAt" class="shrink-0 text-supporting text-muted">{{ dueLabel(item.dueAt) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// The worklist page: the caller's inbox rendered from
// `GET /api/state/worklist` — instances in states whose exits the caller
// controls, overdue first. Rows open the instance surface, where
// transition prompts and evidence collect properly.
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useRegistryStore } from '~/stores/registry';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';

const registry = useRegistryStore();
const items = ref([]);
const loading = ref(false);

const typeLabel = computed(() => typeId => registry.typeRecord(typeId)?.name || typeId);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const result = await $fetch('/api/state/worklist');
    items.value = result.items || [];
  } finally {
    loading.value = false;
  }
}

function open(item) {
  openInstanceInWorkspace({ typeId: item.typeId, instanceId: item.id });
}

function dueLabel(dueAt) {
  const date = new Date(dueAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}
</script>
