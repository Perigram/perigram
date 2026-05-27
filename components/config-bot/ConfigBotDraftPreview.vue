<template>
  <div class="flex flex-col gap-4">
    <StateBlock
      v-if="!draftPackage"
      :message="$t('admin.configBot.emptyDraft')"
      :description="$t('admin.configBot.emptyDraftDescription')"
      icon="pi pi-sparkles"
    />

    <template v-else>
      <ActionToolbar :title="draftPackage.title" :subtitle="draftPackage.summary">
        <template #actions>
          <Tag :value="draftPackage.writes?.mode" severity="secondary" size="small" />
          <Tag :value="draftPackage.validation?.ok ? $t('common.success') : $t('admin.configBot.needsReview')" :severity="draftPackage.validation?.ok ? 'success' : 'warn'" size="small" />
        </template>
      </ActionToolbar>

      <div class="flex flex-wrap gap-2">
        <Button
          v-for="tab in tabs"
          :key="tab"
          :label="$t(`admin.configBot.tabs.${tab}`)"
          :severity="activeTab === tab ? 'primary' : 'secondary'"
          size="small"
          @click="activeTab = tab"
        />
      </div>

      <Panel v-if="activeTab === 'summary'" :header="$t('admin.configBot.packageSummary')">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.configBot.target') }}</span>
            <strong>{{ draftPackage.target }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.configBot.route') }}</span>
            <strong class="font-mono">{{ draftPackage.route }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.configBot.version') }}</span>
            <strong>{{ draftPackage.version }}</strong>
          </div>
        </div>
        <Divider />
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-2">
            <strong>{{ $t('admin.configBot.entities') }}</strong>
            <div class="flex flex-wrap gap-2">
              <Tag v-for="entity in draftPackage.selectedEntities" :key="entity.type" :value="entity.type" severity="info" size="small" />
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <strong>{{ $t('admin.configBot.components') }}</strong>
            <div class="flex flex-wrap gap-2">
              <Tag v-for="component in draftPackage.components" :key="component.key" :value="component.key" severity="secondary" size="small" />
            </div>
          </div>
        </div>
      </Panel>

      <Panel v-else-if="activeTab === 'files'" :header="$t('admin.configBot.files')">
        <div class="flex flex-col gap-4">
          <div v-for="file in draftPackage.files" :key="file.path" class="flex flex-col gap-2 rounded-ui border border-content-border p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <strong class="font-mono">{{ file.path }}</strong>
              <Tag :value="file.language" severity="secondary" size="small" />
            </div>
            <pre class="max-h-96 overflow-auto rounded-ui border border-content-border bg-[var(--ck-subtle-background)] p-3 text-xs"><code>{{ file.content }}</code></pre>
          </div>
        </div>
      </Panel>

      <Panel v-else :header="$t('admin.configBot.domainDraft')">
        <pre class="max-h-[32rem] overflow-auto rounded-ui border border-content-border bg-[var(--ck-subtle-background)] p-3 text-xs"><code>{{ JSON.stringify(draftPackage.domainDraft, null, 2) }}</code></pre>
      </Panel>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
  draftPackage: { type: Object, default: null }
});

const tabs = ['summary', 'files', 'domain'];
const activeTab = ref('summary');
</script>
