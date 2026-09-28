<template>
  <StandardDialog
    v-model:visible="visible"
    size="sm"
    :style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
    :pt="dialogPt"
    @show="focusInput"
    @after-hide="reset"
  >
    <template #header>
      <span class="text-section-heading">{{ $t('nav.search') }}</span>
    </template>
    <div class="flex flex-col gap-3 pt-2">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          ref="input"
          v-model="query"
          type="text"
          class="w-full"
          :placeholder="$t('directory.searchPlaceholder')"
          data-testid="global-search-input"
          @keydown.enter="openFirstResult"
        />
      </IconField>

      <div v-if="searching" class="py-4 text-center text-muted text-body" data-testid="global-search-loading">
        {{ $t('directory.searching') }}
      </div>
      <template v-else>
        <div v-if="!trimmedQuery" class="py-4 text-center text-muted text-body">
          {{ $t('directory.searchHint') }}
        </div>
        <div v-else-if="!totalResults" class="py-4 text-center text-muted text-body" data-testid="global-search-empty">
          {{ $t('directory.noResults') }}
        </div>
        <section v-for="group in resultGroups" v-else :key="group.type" class="flex flex-col gap-1" data-testid="global-search-results">
          <small class="px-1 text-muted">{{ group.label }}</small>
          <button
            v-for="entry in group.results"
            :key="`${entry.type}-${entry._id}`"
            type="button"
            class="flex w-full items-center gap-3 rounded-[var(--p-border-radius-md)] border-0 bg-transparent p-2 text-left cursor-pointer hover:bg-subtle"
            :data-directory-result="`${entry.type}:${entry._id}`"
            @click="openResult(entry)"
          >
            <Avatar
              v-if="entry.type === 'user'"
              :image="entry.data?.avatarUrl || null"
              :label="!entry.data?.avatarUrl ? (entry.identity?.name || '?').charAt(0).toUpperCase() : null"
              shape="circle"
              class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
            />
            <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle">
              <i class="pi pi-building" aria-hidden="true" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body">{{ entry.identity?.name }}</span>
              <span v-if="entry.directory?.sharesOrganization" class="truncate text-supporting text-muted">{{ activeOrganizationName }}</span>
            </span>
            <Tag v-if="entry.type === 'organization' && entry.data?.type" :value="entry.data.type" severity="secondary" />
            <i class="pi pi-arrow-up-right shrink-0 text-muted" aria-hidden="true" />
          </button>
        </section>
      </template>
    </div>
  </StandardDialog>

  <!-- The customizable trigger, mirroring the UserAccountMenu trigger slot
       contract (receives toggle/hide). The search icon button is the
       fallback. -->
  <slot name="trigger" :toggle="open" :hide="close">
    <Button
      data-testid="global-search-trigger"
      icon="pi pi-search"
      text
      rounded
      severity="secondary"
      :aria-label="$t('nav.search')"
      @click="open"
    />
  </slot>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

const props = defineProps({
  autofocus: { type: Boolean, default: true }
});

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();

const visible = ref(false);
const query = ref('');
const groups = ref([]);
const searching = ref(false);
const input = ref();

const trimmedQuery = computed(() => query.value.trim());
const totalResults = computed(() => groups.value.reduce((sum, group) => sum + group.results.length, 0));
const resultGroups = computed(() => groups.value
  .filter(group => group.results.length)
  .map(group => ({
    ...group,
    label: group.type === 'user' ? t('directory.users') : t('directory.organizations')
  })));
const activeOrganizationName = computed(() => authStore.organizationData?.identity?.name || '');

const dialogPt = {
  root: { style: { alignSelf: 'flex-start', marginTop: '10vh' } }
};

let searchTimer = null;
let requestSeq = 0;

watch(query, (value) => {
  clearTimeout(searchTimer);
  const normalized = value.trim();
  if (normalized.length < 2) {
    groups.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(() => runSearch(normalized), 300);
});

async function runSearch(q) {
  const seq = ++requestSeq;
  try {
    const response = await $fetch('/api/directory/search', { query: { q } });
    if (seq !== requestSeq) return;
    groups.value = (response?.groups || []).map(group => ({
      type: group.type,
      results: group.results || []
    }));
  } catch {
    if (seq === requestSeq) groups.value = [];
  } finally {
    if (seq === requestSeq) searching.value = false;
  }
}

function open() {
  requestCloseMobileTransientSurfaces();
  visible.value = true;
}

function close() {
  visible.value = false;
}

function reset() {
  clearTimeout(searchTimer);
  requestSeq++;
  query.value = '';
  groups.value = [];
  searching.value = false;
}

function focusInput() {
  if (props.autofocus) input.value?.$el?.focus?.();
}

function openResult(entry) {
  visible.value = false;
  router.push(entry.type === 'user' ? `/users/${entry._id}` : `/organizations/${entry._id}`);
}

function openFirstResult() {
  const first = resultGroups.value[0]?.results[0];
  if (first) openResult(first);
}
</script>
