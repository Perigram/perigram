<template>
  <DesignerSurface>
    <DesignerWorkspace layout="lanes" class="h-full">
    <template #palette>
      <div class="flex min-h-0 flex-col gap-3 rounded-ui border border-content-border p-3">
        <Button :label="$t('facade.save')" icon="pi pi-save" size="small" :loading="saving" :disabled="!facade?._id" @click="save" />
        <Select v-model="selectedPatternId" :options="patternOptions" option-label="label" option-value="value" entity-type="facadePattern" :placeholder="$t('facade.patterns')" />
      </div>
    </template>

    <ThreeViewport :scene="modelGroup" class="rounded-ui border border-content-border" @select="selectPart" />

    <template #inspector>
      <div class="flex min-h-0 flex-col gap-3 rounded-ui border border-content-border p-3">
        <IdentityBlock v-if="selectedPart" :entity="{ identity: { name: selectedPart.label } }" variant="compact" />
        <StateBlock v-else :message="$t('facade.parts')" icon="pi pi-objects-column" />
        <div v-if="selectedPart" class="flex flex-col gap-2">
          <Select v-model="selectedPatternId" :options="patternOptions" option-label="label" option-value="value" entity-type="facadePattern" :placeholder="$t('facade.patterns')" />
          <Button :label="$t('common.apply')" size="small" severity="secondary" :disabled="!selectedPatternId" @click="assignPattern" />
        </div>
      </div>
    </template>
    </DesignerWorkspace>
  </DesignerSurface>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Button from 'primevue/button';
import Select from '~/components/shared/EntitySelect.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import ThreeViewport from '~/components/shared/ThreeViewport.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({ facade: { type: Object, required: true }, readOnly: { type: Boolean, default: false } });
const emit = defineEmits(['saved']);
const modelGroup = ref(new THREE.Group());
const parts = ref([]);
const patterns = ref([]);
const assignments = ref([]);
const selectedPart = ref(null);
const selectedPatternId = ref('');
const saving = ref(false);
const patternOptions = computed(() => patterns.value.map(pattern => ({ label: pattern.identity?.name || pattern._id, value: String(pattern._id), entity: pattern })));

function artifactUrl(attachment = null) {
  const id = attachment?.fileId;
  const bucket = attachment?.metadata?.bucketName || 'facadeModels';
  return id ? `/api/files/download/${encodeURIComponent(id)}?bucket=${encodeURIComponent(bucket)}` : '';
}
async function loadPatterns() { patterns.value = await $fetch('/api/facade-patterns').catch(() => []); }
function clearModel() { modelGroup.value.clear(); parts.value = []; selectedPart.value = null; }
async function loadModel() {
  clearModel();
  const sourceId = props.facade?.relations?.sourceModel?.id;
  const artifact = sourceId ? await $fetch(`/api/artifacts/${encodeURIComponent(sourceId)}`).catch(() => null) : null;
  const url = artifactUrl(artifact?.attachments?.primary);
  if (!url) return;
  new GLTFLoader().load(url, gltf => {
    const root = gltf.scene;
    let primitiveIndex = 0;
    root.traverse(object => {
      if (!object.isMesh) return;
      const part = { key: `${object.name || 'mesh'}:${primitiveIndex++}`, label: object.name || `Mesh ${primitiveIndex}` };
      object.userData.designerItem = part;
      parts.value.push(part);
    });
    modelGroup.value.add(root);
  });
}
function selectPart(part) {
  selectedPart.value = part;
  selectedPatternId.value = assignments.value.find(item => item.partKey === part.key)?.patternId || '';
}
function assignPattern() {
  if (!selectedPart.value || !selectedPatternId.value) return;
  const pattern = patterns.value.find(item => String(item._id) === String(selectedPatternId.value));
  assignments.value = [...assignments.value.filter(item => item.partKey !== selectedPart.value.key), { partKey: selectedPart.value.key, patternId: selectedPatternId.value, patternRevisionId: pattern?.data?.revisions?.algorithm?.currentId || '', mapping: { mode: 'uv' }, parameters: {}, placements: [] }];
}
async function save() {
  if (props.readOnly || !props.facade?._id) return;
  saving.value = true;
  try {
    const saved = await $fetch(`/api/facades/${encodeURIComponent(props.facade._id)}`, { method: 'PUT', body: { parts: parts.value, partAssignments: assignments.value } });
    emit('saved', saved);
  } finally { saving.value = false; }
}
watch(() => props.facade, () => { assignments.value = [...(props.facade?.data?.partAssignments || [])]; loadPatterns(); loadModel(); }, { immediate: true, deep: false });
onBeforeUnmount(clearModel);
</script>
