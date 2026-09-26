import { computed, unref } from 'vue';


export const useLineage = (entity) => {
  const lineage = computed(() => {
    const e = unref(entity);
    return e?.lineage || {};
  });
  
  const getAncestorId = (type) => lineage.value[`${type}Id`];
  
  return { lineage, getAncestorId };
};
