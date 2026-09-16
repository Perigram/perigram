<template>
  <Panel :header="$t('admin.configBot.citations')">
    <StateBlock
      v-if="!citations.length"
      :message="$t('admin.configBot.noCitations')"
      :description="$t('admin.configBot.noCitationsDescription')"
      icon="pi pi-file"
    />
    <div v-else class="flex flex-col gap-3">
      <div v-for="citation in citations" :key="`${citation.source}:${citation.path}:${citation.title}`" class="flex flex-col gap-1 rounded-ui border border-content-border p-3">
        <div class="flex flex-wrap items-center gap-2">
          <Tag :value="citation.source" severity="secondary" size="small" />
          <strong>{{ citation.title }}</strong>
        </div>
        <small class="text-muted text-technical">{{ citation.path }}</small>
        <p class="m-0 text-body">{{ citation.snippet }}</p>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
  citations: { type: Array, default: () => [] }
});
</script>
