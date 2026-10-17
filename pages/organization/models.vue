<template>
  <StandardPage :title="$t('organization.modelsManagement')" :back="back">
    <div class="flex flex-col gap-6">
      <ActionToolbar :title="$t('llm.models')">
        <template #actions>
          <Button :label="$t('llm.addProfile')" icon="pi pi-plus" severity="secondary" outlined size="small" :disabled="!providerLoaded" data-testid="llm-add-profile" @click="editProfile(null)" />
        </template>
      </ActionToolbar>
      <TableFrame class="ck-collection-rows">
        <DataTable :value="settings?.profiles || []" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="llm-profiles-table">
          <Column field="id" :header="$t('llm.profile')">
            <template #body="{ data }">
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-body">{{ data.id }}</span>
                <small class="text-muted">{{ data.provider }} · {{ data.model }}</small>
              </div>
            </template>
          </Column>
          <Column field="kind" :header="$t('llm.kind')">
            <template #body="{ data }">
              <Tag :value="data.kind === 'image' ? $t('llm.kindImage') : $t('llm.kindChat')" severity="secondary" size="small" />
            </template>
          </Column>
          <Column field="baseUrl" :header="$t('llm.baseUrl')">
            <template #body="{ data }">
              <span class="truncate text-technical">{{ data.baseUrl }}</span>
            </template>
          </Column>
          <Column :header="$t('common.actions.title')" class="text-right">
            <template #body="{ data }">
              <div class="flex justify-end gap-2">
                <Button
                  v-if="data.kind === 'chat'"
                  icon="pi pi-check-circle"
                  text
                  :aria-label="$t('llm.test')"
                  :loading="testingId === data.id"
                  @click="testProfile(data)"
                />
                <Button icon="pi pi-pencil" text :aria-label="$t('common.edit')" @click="editProfile(data)" />
                <Button icon="pi pi-trash" text severity="danger" :aria-label="$t('common.delete')" @click="removeProfile(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </TableFrame>
      <div class="flex flex-wrap items-center gap-2">
        <Tag
          v-if="settings?.resolved?.provider && settings.resolved.provider !== 'none'"
          :value="`${$t('llm.chatRoute')}: ${settings.resolved.provider} · ${settings.resolved.model}`"
          severity="success"
          data-testid="llm-resolved"
        />
        <Tag v-else-if="settings" :value="$t('llm.unconfigured')" severity="secondary" />
      </div>

      <ActionToolbar :title="$t('llm.routing')" />
      <div class="flex flex-wrap items-center gap-3">
        <Select
          v-model="routes.chat"
          :options="chatRouteOptions"
          option-label="label"
          option-value="value"
          :aria-label="$t('llm.chatRoute')"
          class="w-64"
          data-testid="llm-route-chat"
        />
        <Select
          v-model="routes['chat.summaries']"
          :options="chatRouteOptions"
          option-label="label"
          option-value="value"
          :aria-label="$t('llm.summariesRoute')"
          class="w-64"
          data-testid="llm-route-summaries"
        />
        <Button
          :label="$t('common.save')"
          severity="secondary"
          outlined
          size="small"
          :loading="savingProvider"
          :disabled="!providerLoaded"
          data-testid="llm-save"
          @click="saveSettings"
        />
      </div>
    </div>

    <ActionToolbar :title="$t('webSearch.title')" />
    <div class="flex flex-wrap items-center gap-3" data-testid="web-search-block">
      <Select
        v-model="webSearch.provider"
        :options="webSearchProviderOptions"
        option-label="label"
        option-value="value"
        :aria-label="$t('webSearch.provider')"
        class="w-64"
        data-testid="web-search-provider"
      />
      <InputText
        v-if="webSearch.provider === 'searxng'"
        v-model="webSearch.baseUrl"
        type="text"
        class="w-64"
        :placeholder="$t('webSearch.searxngUrl')"
        :aria-label="$t('webSearch.searxngUrl')"
        data-testid="web-search-baseurl"
      />
      <Password
        v-if="webSearch.provider === 'tavily'"
        v-model="webSearch.apiKey"
        :feedback="false"
        :placeholder="webSearch.apiKeySet ? $t('llm.apiKeySet') : $t('webSearch.tavilyKey')"
        :aria-label="$t('webSearch.tavilyKey')"
        input-class="w-full"
      />
      <Button
        :label="$t('llm.test')"
        icon="pi pi-check-circle"
        severity="secondary"
        text
        size="small"
        :loading="testingWebSearch"
        :disabled="!webSearchLoaded || webSearch.provider === 'none'"
        data-testid="web-search-test"
        @click="runWebSearchTest"
      />
      <Button
        :label="$t('common.save')"
        severity="secondary"
        outlined
        size="small"
        :loading="savingWebSearch"
        :disabled="!webSearchLoaded"
        data-testid="web-search-save"
        @click="saveWebSearchSettings"
      />
    </div>

    <StandardDialog v-model:visible="profileVisible" size="sm" :header="$t('llm.profile')" :show-default-footer="false">
      <div class="flex flex-col gap-3 pt-2">
        <InputText
          v-model="profileForm.id"
          type="text"
          class="w-full"
          :placeholder="$t('llm.profileName')"
          :aria-label="$t('llm.profileName')"
          data-testid="llm-profile-name"
          :disabled="profileEditingExisting"
        />
        <Select
          v-model="profileForm.kind"
          :options="kindOptions"
          option-label="label"
          option-value="value"
          :aria-label="$t('llm.kind')"
        />
        <Select
          v-model="profileForm.provider"
          :options="providerOptions"
          option-label="label"
          option-value="value"
          :aria-label="$t('llm.provider')"
        />
        <InputText
          v-if="!PRESETS[profileForm.provider]"
          v-model="profileForm.baseUrl"
          type="text"
          class="w-full"
          :placeholder="$t('llm.baseUrl')"
          :aria-label="$t('llm.baseUrl')"
          data-testid="llm-profile-baseurl"
        />
        <Password
          v-model="profileForm.apiKey"
          :feedback="false"
          :placeholder="profileForm.apiKeySet ? $t('llm.apiKeySet') : (PRESETS[profileForm.provider] ? $t('llm.apiKeyZai') : $t('llm.apiKey'))"
          :aria-label="$t('llm.apiKey')"
          input-class="w-full"
        />
        <div class="flex justify-end gap-2">
          <Button
            :label="$t('common.save')"
            icon="pi pi-check"
            :loading="savingProvider"
            :disabled="!profileForm.id.trim() || !profileForm.baseUrl.trim()"
            data-testid="llm-profile-save"
            @click="saveProfile"
          />
        </div>
      </div>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import { usePageBack } from '~/composables/usePageBack';
import { useRoute } from 'vue-router';

const route = useRoute();
const { t } = useI18n();
const toast = useToast();

// The row surface is the preset's content background; corners clip at the
// token radius (the shared table pattern).
const rowSurfaceClass = () => '[clip-path:inset(0_round_var(--p-border-radius-xl))]';
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const settings = ref(null);
const providerLoaded = ref(false);
const profiles = ref([]);
const routes = reactive({ chat: '', 'chat.summaries': '' });
const profileVisible = ref(false);
const profileEditingExisting = ref(false);
const profileForm = reactive({ id: '', kind: 'chat', provider: 'ollama', baseUrl: '', apiKey: '', apiKeySet: false });
const savingProvider = ref(false);
const testingId = ref('');

const kindOptions = computed(() => ([
    { label: t('llm.kindChat'), value: 'chat' },
    { label: t('llm.kindImage'), value: 'image' }
]));
// Known providers are login options: the platform owns their endpoint and
// dialect, the admin pastes only a key. The stored profile keeps the wire
// truth (provider dialect + baseUrl); the preset is a UI-level identity.
// Model choice never lives here: pickers are endpoint-fed at the models
// screen and chosen at the execution points.
const ZAI_PRESET = { provider: 'anthropic', baseUrl: 'https://api.z.ai/api/anthropic' };
const PRESETS = { zai: ZAI_PRESET };
const wireProvider = (provider) => PRESETS[provider]?.provider || provider;
const presetOf = (profile) => Object.entries(PRESETS)
    .find(([, preset]) => profile.provider === preset.provider && profile.baseUrl === preset.baseUrl)?.[0] || profile.provider;
const providerOptions = computed(() => ([
    { label: t('llm.providerZai'), value: 'zai' },
    { label: 'Ollama', value: 'ollama' },
    { label: 'Anthropic Messages', value: 'anthropic' },
    { label: t('llm.providerOpenAiShaped'), value: 'openai' }
]));
watch(() => profileForm.provider, (provider) => {
    const preset = PRESETS[provider];
    if (preset) profileForm.baseUrl = preset.baseUrl;
});
const chatRouteOptions = computed(() => ([
    { label: t('llm.envDefault'), value: '' },
    ...profiles.value.filter(profile => profile.kind === 'chat').map(profile => ({ label: profile.id, value: profile.id }))
]));

// The org's public-web search provider behind the agent's web_search
// tool (searxng self-hosted, tavily keyed; see the web-search feature).
// An untouched key field keeps the stored key — the key only travels
// when typed.
const webSearch = reactive({ provider: 'none', baseUrl: '', apiKey: '', apiKeySet: false });
const webSearchLoaded = ref(false);
const savingWebSearch = ref(false);
const testingWebSearch = ref(false);
const webSearchProviderOptions = computed(() => ([
    { label: t('webSearch.none'), value: 'none' },
    { label: 'SearXNG', value: 'searxng' },
    { label: 'Tavily', value: 'tavily' }
]));
async function loadWebSearchSettings() {
    try {
        const saved = await $fetch('/api/web-search/settings');
        Object.assign(webSearch, {
            provider: saved?.provider || 'none',
            baseUrl: saved?.baseUrl || '',
            apiKey: '',
            apiKeySet: Boolean(saved?.apiKeySet)
        });
        webSearchLoaded.value = true;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    }
}
async function saveWebSearchSettings() {
    savingWebSearch.value = true;
    try {
        const saved = await $fetch('/api/web-search/settings', {
            method: 'PUT',
            body: {
                provider: webSearch.provider,
                baseUrl: webSearch.provider === 'searxng' ? webSearch.baseUrl : '',
                ...(webSearch.apiKey ? { apiKey: webSearch.apiKey } : {})
            }
        });
        Object.assign(webSearch, { provider: saved?.provider || 'none', baseUrl: saved?.baseUrl || '', apiKey: '', apiKeySet: Boolean(saved?.apiKeySet) });
        toast.add({ severity: 'success', summary: t('common.success'), life: 1500 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
    } finally {
        savingWebSearch.value = false;
    }
}
async function runWebSearchTest() {
    testingWebSearch.value = true;
    try {
        const result = await $fetch('/api/web-search/test', { method: 'POST' });
        if (result?.ok) {
            toast.add({ severity: 'success', summary: `${result.provider} · ${result.results}`, life: 3000 });
        } else {
            toast.add({ severity: 'error', summary: t('webSearch.title'), detail: result?.reason || '', life: 8000 });
        }
    } catch (error) {
        toast.add({ severity: 'error', summary: t('webSearch.title'), detail: error?.data?.message || error?.message || '', life: 8000 });
    } finally {
        testingWebSearch.value = false;
    }
}

// The page is mounted both as a standalone route and as a home pane tab:
// the back control belongs to the routed surface.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/models' });

async function loadSettings() {
    try {
        settings.value = await $fetch('/api/llm/settings');
        profiles.value = settings.value?.profiles || [];
        routes.chat = settings.value?.routes?.chat || '';
        routes['chat.summaries'] = settings.value?.routes?.['chat.summaries'] || '';
        providerLoaded.value = true;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    }
}

function editProfile(profile) {
    profileEditingExisting.value = Boolean(profile);
    endpointModels.value = [];
    Object.assign(profileForm, profile ? {
        id: profile.id,
        kind: profile.kind,
        provider: presetOf(profile),
        baseUrl: profile.baseUrl,
        apiKey: '',
        apiKeySet: profile.apiKeySet
    } : {
        id: '', kind: 'chat', provider: 'ollama', baseUrl: '', model: '', apiKey: '', apiKeySet: false
    });
    profileVisible.value = true;
}

function removeProfile(profile) {
    profiles.value = profiles.value.filter(item => item.id !== profile.id);
    if (routes.chat === profile.id) routes.chat = '';
    if (routes['chat.summaries'] === profile.id) routes['chat.summaries'] = '';
    saveSettings();
}

async function saveProfile() {
    savingProvider.value = true;
    try {
        const form = { ...profileForm, provider: wireProvider(profileForm.provider) };
        const next = profileEditingExisting.value
            ? profiles.value.map(item => (item.id === form.id ? { ...item, ...form } : item))
            : [...profiles.value, form];
        settings.value = await $fetch('/api/llm/settings', {
            method: 'PUT',
            body: { profiles: next, routes }
        });
        profiles.value = settings.value?.profiles || [];
        routes.chat = settings.value?.routes?.chat || '';
        routes['chat.summaries'] = settings.value?.routes?.['chat.summaries'] || '';
        profileVisible.value = false;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
    } finally {
        savingProvider.value = false;
    }
}

async function saveSettings() {
    savingProvider.value = true;
    try {
        settings.value = await $fetch('/api/llm/settings', {
            method: 'PUT',
            body: { profiles: profiles.value, routes }
        });
        profiles.value = settings.value?.profiles || [];
        toast.add({ severity: 'success', summary: t('common.success'), life: 1500 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
    } finally {
        savingProvider.value = false;
    }
}

async function testProfile(profile) {
    testingId.value = profile.id;
    try {
        const result = await $fetch('/api/llm/test', { method: 'POST', body: { profileId: profile.id } });
        if (result?.ok) {
            toast.add({ severity: 'success', summary: `${profile.id}: ${result.provider} · ${result.model}`, life: 3000 });
        } else {
            toast.add({ severity: 'error', summary: profile.id, detail: result?.reason || '', life: 8000 });
        }
    } catch (error) {
        toast.add({ severity: 'error', summary: profile.id, detail: error?.data?.message || error?.message || '', life: 8000 });
    } finally {
        testingId.value = '';
    }
}


onMounted(loadSettings);
</script>
