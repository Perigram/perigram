<script setup>
/**
 * Lineage Breadcrumbs Component - v24 Standardized
 * Renders an ancestry path based on the lineage block
 */
const props = defineProps({
  lineage: { type: Object, required: true },
  variant: { type: String, default: 'default' }
});

const items = computed(() => {
  const crumbs = [];
  const l = props.lineage;

  if (l.organizationId) {
    crumbs.push({ label: 'Organization', to: '/organization' });
  }
  if (l.projectId) {
    crumbs.push({ label: 'Project', to: `/project/${l.projectId}` });
  }
  if (l.queueId) {
    crumbs.push({ label: 'Queue', to: `/project/${l.projectId}/queue/${l.queueId}` });
  }
  
  return crumbs;
});
</script>

<template>
  <nav class="lineage-crumbs" aria-label="Breadcrumb">
    <ol class="flex list-none p-0 m-0">
      <li v-for="(item, idx) in items" :key="idx" class="lineage-crumb">
        <NuxtLink v-if="item.to" :to="item.to" class="hover:text-primary transition-colors">
          {{ item.label }}
        </NuxtLink>
        <span v-else>{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
