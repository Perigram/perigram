<script setup>
import { ref, computed, onMounted } from 'vue';

definePageMeta({ layout: 'app', middleware: 'auth' });

const types = ref([]);
const attachmentKinds = ref({});
const errors = ref([]);
const loading = ref(true);
const selectedClass = ref('all');

const classes = computed(() => ['all', ...new Set(types.value.map(type => type.class))]);
const filtered = computed(() => selectedClass.value === 'all'
  ? types.value
  : types.value.filter(type => type.class === selectedClass.value));

const byClass = computed(() => {
  const groups = new Map();
  for (const type of filtered.value) {
    if (!groups.has(type.class)) groups.set(type.class, []);
    groups.get(type.class).push(type);
  }
  return [...groups.entries()];
});

onMounted(async () => {
  try {
    const response = await $fetch('/api/admin/cts/types');
    types.value = response.types || [];
    attachmentKinds.value = response.attachmentKinds || {};
    errors.value = response.errors || [];
  } catch (error) {
    errors.value = [error?.message || 'failed to load type registry'];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <StandardPage title="Type Registry">
    <template #actions>
      <Button label="Process Designer" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
      <SelectButton v-model="selectedClass" :options="classes" size="small" />
    </template>

    <StateBlock :loading="loading" :error="errors.length ? errors.join('; ') : null" :empty="!loading && !types.length">
      <div v-if="errors.length" class="mb-4 p-3 border-round surface-100 text-sm">
        <div v-for="diagnostic in errors" :key="diagnostic" class="text-red-500">{{ diagnostic }}</div>
      </div>

      <div v-for="[className, group] in byClass" :key="className" class="mb-6">
        <div class="text-lg font-semibold mb-3 capitalize flex align-items-center gap-2">
          <i class="pi pi-box" />{{ className }} <Tag :value="String(group.length)" severity="info" />
        </div>
        <ResponsiveGrid>
          <EntityCard v-for="type in group" :key="type.id">
            <template #identity>
              <div class="flex align-items-center gap-2">
                <i :class="type.render.icon" />
                <span class="font-medium">{{ type.render.label }}</span>
                <Tag :value="`v${type.version}`" severity="secondary" />
              </div>
            </template>
            <template #content>
              <div v-if="type.states.main" class="mb-2 flex flex-wrap gap-1">
                <Tag v-for="(policy, value) in type.render.states" :key="value"
                     :value="policy.label" :severity="policy.severity" />
              </div>
              <div class="text-sm text-500">
                {{ type.states.main ? `${type.transitions.length} transitions` : 'no lifecycle' }}
                · {{ Object.keys(type.fields).length }} fields
                <template v-if="Object.keys(type.edges.children || {}).length">
                  · children: {{ Object.keys(type.edges.children).join(', ') }}
                </template>
                <template v-if="Object.keys(type.operators || {}).length">
                  · operators: {{ Object.keys(type.operators).join(', ') }}
                </template>
              </div>
            </template>
          </EntityCard>
        </ResponsiveGrid>
      </div>

      <div v-if="Object.keys(attachmentKinds).length" class="text-sm text-500">
        Payload traits: {{ Object.keys(attachmentKinds).length }} attachment kinds available as type data.
      </div>
    </StateBlock>
  </StandardPage>
</template>
