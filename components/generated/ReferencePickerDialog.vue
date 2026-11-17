<template>
  <StandardDialog :visible="visible" size="sm"  :title="t('processDesigner.insertReference')" @update:visible="shown => { if (!shown) close(); }">
    <div class="flex max-h-[70vh] min-w-72 flex-col gap-3 overflow-y-auto">
      <InstanceTree v-if="!selected" :show-create="false"  :aria-label="t('processDesigner.chooseInstance')" @select="selectRecord" />
      <template v-else>
        <div class="flex items-center gap-2">
          <Button icon="pi pi-arrow-left" text rounded size="small" severity="secondary" @click="selected = null" />
          <InstanceInlineRef :type="selected.type" :entity="selected.entity" :fetch="false" :interactive="false" />
        </div>
        <Button  :label="t('processDesigner.insertLiveReference')" icon="pi pi-link" text class="w-full justify-start" @click="pick()" />
        <div v-if="revisions.length" class="flex flex-col gap-1">
          <div class="text-supporting text-title">{{ t('processDesigner.pinToRevision') }}</div>
          <Button v-for="revision in revisions" :key="revision._id" :label="t('processDesigner.revisionLabel', { number: revision.data?.number || '', createdAt: revision.data?.createdAt || '' })" icon="pi pi-bookmark" text class="w-full justify-start" @click="pick(revision._id)" />
        </div>
        <div v-else class="text-supporting text-muted">{{ t('processDesigner.noRetainedRevisions') }}</div>
      </template>
    </div>
  </StandardDialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InstanceTree from '~/components/shared/InstanceTree.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const { t } = useI18n();
const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'pick']);
const selected = ref(null);
const revisions = ref([]);

async function selectRecord(item) {
  if (!item?.type || !item?.id) return;
  selected.value = item;
  revisions.value = [];
  try {
    revisions.value = await $fetch('/api/instance-revisions', { query: { typeId: item.type, instanceId: item.id, scope: 'content' } });
  } catch {
    revisions.value = [];
  }
}
function pick(revisionId = null) {
  if (!selected.value) return;
  emit('pick', { typeId: String(selected.value.type), instanceId: String(selected.value.id), ...(revisionId ? { revisionId: String(revisionId) } : {}) });
  close();
}
function close() {
  selected.value = null;
  revisions.value = [];
  emit('close');
}
watch(() => props.visible, value => { if (!value) { selected.value = null; revisions.value = []; } });
</script>
