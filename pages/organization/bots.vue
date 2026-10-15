<template>
  <StandardPage :title="$t('organization.botsManagement')" :back="back">
    <template #actions>
        <Button :label="$t('common.create')" icon="pi pi-plus" :disabled="!canManage" @click="openCreate" />
    </template>

    <div class="flex flex-col gap-6">
      <!-- The brain before the members: models live on different endpoints
           per purpose, so the org declares named profiles and routes
           capabilities to them. -->
      <ActionToolbar :title="$t('llm.models')" />
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
        <Button :label="$t('llm.addProfile')" icon="pi pi-plus" severity="secondary" outlined size="small" :disabled="!providerLoaded" @click="editProfile(null)" />
        <Tag v-if="settings?.resolved?.provider && settings.resolved.provider !== 'none'" :value="`${$t('llm.chatRoute')}: ${settings.resolved.provider} · ${settings.resolved.model}`" severity="success" data-testid="llm-resolved" />
        <Tag v-else-if="settings" :value="$t('llm.unconfigured')" severity="secondary" />
        <span v-if="testResult" class="flex min-w-0 items-center gap-2 text-supporting" :class="testResult.ok ? 'text-primary' : 'text-muted'">
          <i class="pi shrink-0" :class="testResult.ok ? 'pi-check' : 'pi-times'" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ testResult.ok ? $t('llm.testOk') : testResult.reason }}</span>
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-muted text-body">{{ $t('llm.routing') }}</span>
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

    <TableFrame class="ck-collection-rows">
      <DataTable :value="bots" :loading="loading" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="org-bots-table">
        <Column field="name" :header="$t('profile.name')">
          <template #body="{ data }">
            <div class="flex min-w-0 items-center gap-2">
              <Avatar
                :image="data.avatarUrl || null"
                :label="!data.avatarUrl ? String(data.name || '?').charAt(0).toUpperCase() : null"
                shape="circle"
                class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
              />
              <span class="min-w-0 flex-1 truncate text-body">{{ data.name }}</span>
              <Tag v-if="data.assistant" :value="$t('support.bots.assistant')" severity="secondary" size="small" />
            </div>
          </template>
        </Column>
        <Column field="createdAt" :header="$t('common.created')">
          <template #body="{ data }">
            {{ formatDate(data.createdAt) }}
          </template>
        </Column>
        <Column :header="$t('common.actions.title')" class="text-right">
          <template #body="{ data }">
            <div class="flex justify-end gap-2">
              <Button
                icon="pi pi-key"
                text
                :aria-label="$t('support.bots.rotateToken')"
                :loading="workingBotId === data.id"
                @click="rotateToken(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                severity="danger"
                :aria-label="$t('common.delete')"
                :loading="workingBotId === data.id"
                @click="requestDelete(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </TableFrame>

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
          v-model="profileForm.baseUrl"
          type="text"
          class="w-full"
          :placeholder="$t('llm.baseUrl')"
          :aria-label="$t('llm.baseUrl')"
        />
        <InputText
          v-model="profileForm.model"
          type="text"
          class="w-full"
          :placeholder="$t('llm.model')"
          :aria-label="$t('llm.model')"
        />
        <Password
          v-model="profileForm.apiKey"
          :feedback="false"
          :placeholder="profileForm.apiKeySet ? $t('llm.apiKeySet') : $t('llm.apiKey')"
          :aria-label="$t('llm.apiKey')"
          input-class="w-full"
        />
        <div class="flex justify-end gap-2">
          <Button
            :label="$t('common.save')"
            icon="pi pi-check"
            :loading="savingProvider"
            :disabled="!profileForm.id.trim() || !profileForm.baseUrl.trim() || !profileForm.model.trim()"
            data-testid="llm-profile-save"
            @click="saveProfile"
          />
        </div>
      </div>
    </StandardDialog>

    <StandardDialog v-model:visible="createVisible" size="sm" :header="$t('support.bots.title')" :show-default-footer="false">
      <div class="flex flex-col gap-3 pt-2">
        <InputText
          v-model="newBotName"
          type="text"
          class="w-full"
          :placeholder="$t('support.bots.namePlaceholder')"
          :aria-label="$t('support.bots.namePlaceholder')"
          data-testid="org-bot-name"
          @keydown.enter="createBot"
        />
        <div v-if="issuedToken" class="flex items-center gap-2">
          <InputText
            :model-value="issuedToken"
            readonly
            class="min-w-0 flex-1 text-technical"
            :aria-label="$t('support.bots.token')"
            data-testid="org-bot-token"
          />
          <Button icon="pi pi-copy" severity="secondary" text rounded :aria-label="$t('common.copy')" @click="copyToken" />
        </div>
        <div class="flex justify-end gap-2">
          <Button
            :label="$t('common.create')"
            icon="pi pi-plus"
            :loading="saving"
            :disabled="!newBotName.trim()"
            data-testid="org-bot-create"
            @click="createBot"
          />
        </div>
      </div>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import { useAuthStore } from '~/stores/auth';
import { useAgentBotsStore } from '~/stores/agentBots';
import { usePageBack } from '~/composables/usePageBack';
import { useRoute } from 'vue-router';

const route = useRoute();
const { t, locale } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();
const agentBots = useAgentBotsStore();

// The row surface is the preset's content background; corners clip at the
// token radius (the shared table pattern).
const rowSurfaceClass = () => '[clip-path:inset(0_round_var(--p-border-radius-xl))]';
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const loading = ref(false);
const bots = ref([]);
const createVisible = ref(false);
const newBotName = ref('');
const saving = ref(false);
const workingBotId = ref('');
const issuedToken = ref('');

// Model profiles and capability routing (the bot brain): the org declares
// named endpoints and routes capabilities to them; keys never render — an
// empty password field keeps the stored one.
const settings = ref(null);
const providerLoaded = ref(false);
const profiles = ref([]);
const routes = reactive({ chat: '', 'chat.summaries': '' });
const profileVisible = ref(false);
const profileEditingExisting = ref(false);
const profileForm = reactive({ id: '', kind: 'chat', provider: 'ollama', baseUrl: '', model: '', apiKey: '', apiKeySet: false });
const savingProvider = ref(false);
const testingId = ref('');
const testResult = ref(null);

const kindOptions = computed(() => ([
    { label: t('llm.kindChat'), value: 'chat' },
    { label: t('llm.kindImage'), value: 'image' }
]));
const providerOptions = computed(() => ([
    { label: 'Ollama', value: 'ollama' },
    { label: 'Anthropic Messages', value: 'anthropic' },
    { label: t('llm.providerOpenAiShaped'), value: 'openai' }
]));
const chatRouteOptions = computed(() => ([
    { label: t('llm.envDefault'), value: '' },
    ...profiles.value.filter(profile => profile.kind === 'chat').map(profile => ({ label: profile.id, value: profile.id }))
]));

const canManage = computed(() => agentBots.canManageBots);
// The page is mounted both as a standalone route and as a home pane tab:
// the back control belongs to the routed surface.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/bots' });

const formatDate = (value) => new Date(value).toLocaleDateString(locale.value);

async function refresh() {
    loading.value = true;
    try {
        await agentBots.refresh();
        bots.value = agentBots.bots;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        loading.value = false;
    }
}

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
    Object.assign(profileForm, profile ? {
        id: profile.id,
        kind: profile.kind,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
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
        const next = profileEditingExisting.value
            ? profiles.value.map(item => (item.id === profileForm.id ? { ...item, ...profileForm } : item))
            : [...profiles.value, { ...profileForm }];
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
    testResult.value = null;
    try {
        testResult.value = await $fetch('/api/llm/test', { method: 'POST', body: { profileId: profile.id } });
    } catch (error) {
        testResult.value = { ok: false, reason: error?.data?.message || error?.message || '' };
    } finally {
        testingId.value = '';
    }
}

function openCreate() {
    newBotName.value = '';
    issuedToken.value = '';
    createVisible.value = true;
}

async function createBot() {
    const name = newBotName.value.trim();
    if (!name) return;
    saving.value = true;
    try {
        const created = await agentBots.createBot({ name });
        issuedToken.value = created?.token || '';
        newBotName.value = '';
        await refresh();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        saving.value = false;
    }
}

async function rotateToken(bot) {
    workingBotId.value = bot.id;
    try {
        const rotated = await agentBots.rotateBotToken(bot.id);
        issuedToken.value = rotated?.token || '';
        createVisible.value = true;
        newBotName.value = '';
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        workingBotId.value = '';
    }
}

function requestDelete(bot) {
    confirm.require({
        message: t('support.bots.deleteConfirm', { name: bot.name }),
        header: t('common.delete'),
        icon: 'pi pi-trash',
        accept: async () => {
            workingBotId.value = bot.id;
            try {
                await agentBots.deleteBot(bot.id);
                await refresh();
            } catch (error) {
                toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
            } finally {
                workingBotId.value = '';
            }
        }
    });
}

async function copyToken() {
    try {
        await navigator.clipboard.writeText(issuedToken.value);
        toast.add({ severity: 'success', summary: t('common.copy'), life: 1500 });
    } catch {
        toast.add({ severity: 'warn', summary: t('common.copy'), life: 1500 });
    }
}

onMounted(() => {
    refresh();
    loadSettings();
});
</script>
