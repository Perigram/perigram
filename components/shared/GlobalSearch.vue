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
            :ref="el => setRowEl(`${entry.type}-${entry._id}`, el)"
            type="button"
            class="flex w-full items-center gap-3 rounded-[var(--p-border-radius-md)] border-0 bg-transparent p-2 text-left cursor-pointer hover:bg-subtle"
            :data-directory-result="`${entry.type}:${entry._id}`"
            @click="openResult(entry, $event)"
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

  <!-- The in-place result popup: the avatar-forward directory face plus
       chat and open actions, anchored at the clicked row (the first row
       for the Enter key path). The open action expands through the
       workspace-open seam; nothing navigates to a route. -->
  <Popover ref="resultOp" append-to="body">
    <div class="w-[min(28rem,calc(100vw-3rem))]" data-testid="directory-result-popup">
      <div class="flex flex-col gap-3 p-4">
        <div class="flex items-start gap-4">
          <Avatar
            v-if="selected?.type === 'user'"
            :image="selected?.data?.avatarUrl || null"
            :label="!selected?.data?.avatarUrl ? (selected?.identity?.name || '?').charAt(0).toUpperCase() : null"
            shape="circle"
            size="xlarge"
            class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
          />
          <span v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-subtle">
            <i class="pi pi-building text-section-heading" aria-hidden="true" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <span class="truncate text-label">{{ selected?.identity?.name }}</span>
            <span v-if="selected?.type === 'user' && selected?.directory?.sharesOrganization" class="truncate text-supporting text-muted">{{ activeOrganizationName }}</span>
            <div v-if="selected?.type === 'organization' && selected?.data?.type" class="mt-1">
              <Tag :value="selected.data.type" severity="secondary" />
            </div>
          </div>
        </div>
        <Divider class="m-0" />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Button
            v-if="selected?.type === 'user' && !selected?.directory?.isSelf"
            icon="pi pi-comments"
            text
            size="small"
            :aria-label="$t('support.openChat')"
            @click="chatWithSelected"
          />
          <Button
            :label="$t('common.open')"
            icon="pi pi-external-link"
            text
            size="small"
            :aria-label="$t('common.open')"
            data-testid="directory-popup-open"
            @click="openSelected"
          />
        </div>
      </div>
    </div>
  </Popover>

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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Divider from 'primevue/divider';
import Popover from 'primevue/popover';
import Tag from 'primevue/tag';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { requestCloseMobileTransientSurfaces, MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { openInstanceChat } from '~/utils/instance-chat.js';

const props = defineProps({
  autofocus: { type: Boolean, default: true }
});

const { t } = useI18n();
const authStore = useAuthStore();

const visible = ref(false);
const query = ref('');
const groups = ref([]);
const searching = ref(false);
const input = ref();
const resultOp = ref();
const selected = ref(null);
const rowEls = new Map();

function setRowEl(key, el) {
  if (el) rowEls.set(key, el);
  else rowEls.delete(key);
}

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
  closeResultPopup();
  selected.value = null;
}

function focusInput() {
  if (props.autofocus) input.value?.$el?.focus?.();
}

function openResult(entry, event) {
  selected.value = entry;
  resultOp.value?.toggle(event);
}

// The Enter key path anchors the popup at the first result row — the same
// surface a pointer click gets, never a navigation. PrimeVue's toggle only
// reads `currentTarget`, so the keyboard anchor is that row element.
function openFirstResult() {
  const first = resultGroups.value[0]?.results[0];
  if (!first) return;
  const anchor = rowEls.get(`${first.type}-${first._id}`);
  if (!anchor) return;
  selected.value = first;
  resultOp.value?.toggle({ currentTarget: anchor, target: anchor }, anchor);
}

// The open action expands the record inside the home workspace — pane tab
// on desktop, the home dialog on mobile; never a standalone route.
function openSelected() {
  const entry = selected.value;
  if (!entry) return;
  visible.value = false;
  openInstanceInWorkspace({ typeId: entry.type, instanceId: entry._id });
}

function chatWithSelected() {
  const entry = selected.value;
  if (!entry) return;
  visible.value = false;
  openInstanceChat({
    type: 'user',
    id: entry._id,
    name: entry.identity?.name || ''
  });
}

function closeResultPopup() {
  resultOp.value?.hide?.();
}

onMounted(() => {
  window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeResultPopup);
});

onUnmounted(() => {
  window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeResultPopup);
});
</script>
