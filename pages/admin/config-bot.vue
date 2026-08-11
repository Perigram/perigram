<template>
  <StandardPage :title="$t('admin.configBot.title')" :subtitle="$t('admin.configBot.subtitle')">
    <template #actions>
      <Button icon="pi pi-database" :label="$t('admin.configBot.reindex')" severity="secondary" :loading="reindexing" @click="reindexKnowledge" />
      <Button icon="pi pi-download" :label="$t('admin.configBot.exportPackage')" :disabled="!draftPackage" @click="exportPackage" />
    </template>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[22rem_1fr_22rem]">
      <Panel :header="$t('admin.configBot.request')">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label for="config-bot-entity">{{ $t('admin.configBot.primaryEntity') }}</label>
            <Select
              id="config-bot-entity"
              v-model="selectedEntityType"
              :options="entityOptions"
              option-label="label"
              option-value="value"
              show-clear
              class="w-full"
              :placeholder="$t('admin.configBot.entityPlaceholder')"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="config-bot-prompt">{{ $t('admin.configBot.prompt') }}</label>
            <Textarea
              id="config-bot-prompt"
              v-model="prompt"
              rows="9"
              class="w-full"
              :placeholder="$t('admin.configBot.promptPlaceholder')"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button icon="pi pi-sparkles" :label="$t('admin.configBot.generate')" :disabled="!canSubmit" :loading="loading" @click="generateDraft" />
            <Button icon="pi pi-comments" :label="$t('admin.configBot.ask')" severity="secondary" :disabled="!canSubmit" :loading="chatting" @click="askQuestion" />
          </div>

          <Message severity="info">
            {{ $t('admin.configBot.noApply') }}
          </Message>
          <Message v-if="error" severity="error">
            {{ error }}
          </Message>
        </div>
      </Panel>

      <ConfigBotDraftPreview :draft-package="draftPackage" />

      <div class="flex flex-col gap-4">
        <ConfigBotValidationPanel :validation="draftPackage?.validation" />
        <ConfigBotCitationList :citations="visibleCitations" />
        <Panel v-if="assistantMessage" :header="$t('admin.configBot.answer')">
          <p class="m-0 whitespace-pre-wrap">{{ assistantMessage.content }}</p>
        </Panel>
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from '~/components/shared/EntitySelect.vue';
import Textarea from 'primevue/textarea';
import ConfigBotCitationList from '~/components/config-bot/ConfigBotCitationList.vue';
import ConfigBotDraftPreview from '~/components/config-bot/ConfigBotDraftPreview.vue';
import ConfigBotValidationPanel from '~/components/config-bot/ConfigBotValidationPanel.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: ['auth']
});

const prompt = ref('');
const selectedEntityType = ref(null);
const entityOptions = ref([]);
const draftPackage = ref(null);
const assistantMessage = ref(null);
const sessionId = ref(null);
const loading = ref(false);
const chatting = ref(false);
const reindexing = ref(false);
const error = ref('');
const { t } = useI18n();

const canSubmit = computed(() => prompt.value.trim().length > 0);
const visibleCitations = computed(() => assistantMessage.value?.citations || draftPackage.value?.citations || []);

onMounted(loadDomainEntities);

async function loadDomainEntities() {
  try {
    const response = await $fetch('/api/admin/domain');
    entityOptions.value = (response.entities || []).map(entity => ({
      label: `${entity.type} (${entity.collection})`,
      value: entity.type
    }));
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.configBot.errors.loadDomainFailed');
  }
}

async function generateDraft() {
  error.value = '';
  loading.value = true;
  try {
    const response = await $fetch('/api/config-bot/generate', {
      method: 'POST',
      body: {
        message: prompt.value,
        sessionId: sessionId.value,
        context: createContext()
      }
    });
    sessionId.value = response.session?.id || sessionId.value;
    draftPackage.value = response.package;
    assistantMessage.value = null;
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.configBot.errors.generateFailed');
  } finally {
    loading.value = false;
  }
}

async function askQuestion() {
  error.value = '';
  chatting.value = true;
  try {
    const response = await $fetch('/api/config-bot/chat', {
      method: 'POST',
      body: {
        message: prompt.value,
        sessionId: sessionId.value,
        context: createContext()
      }
    });
    sessionId.value = response.session?.id || sessionId.value;
    assistantMessage.value = response.message;
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.configBot.errors.chatFailed');
  } finally {
    chatting.value = false;
  }
}

async function reindexKnowledge() {
  error.value = '';
  reindexing.value = true;
  try {
    await $fetch('/api/admin/config-bot/reindex', { method: 'POST' });
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.configBot.errors.reindexFailed');
  } finally {
    reindexing.value = false;
  }
}

function createContext() {
  return {
    target: 'admin-micro-app',
    entityType: selectedEntityType.value || null,
    writes: 'draft-only'
  };
}

function exportPackage() {
  if (!draftPackage.value || !process.client) return;
  const blob = new Blob([JSON.stringify(draftPackage.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${draftPackage.value.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
