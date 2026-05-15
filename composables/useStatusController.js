import { ref } from 'vue';

/**
 * Status Controller Composable
 * Frontend bridge for the centralized State Machine engine
 */
export const useStatusController = () => {
  const isTransitioning = ref(false);
  const transitionError = ref(null);

  const getStatusEndpoint = (type, id) => {
    const map = {
        project: `/api/project/${id}`,
        queue: `/api/queue/${id}`,
        requisition: `/api/requisitions/${id}`,
        batch: `/api/material-piles/${id}`,
        pile: `/api/material-piles/${id}`,
        material_pile: `/api/material-piles/${id}`,
        sheet: `/api/sheets/${id}`,
        remnant: `/api/remnants/${id}`,
        cassetteInstance: `/api/cassette-instances/${id}`,
        cassette_instance: `/api/cassette-instances/${id}`,
        cassetteDesign: `/api/cassette-designs/${id}`,
        cassette_design: `/api/cassette-designs/${id}`,
        sheetDesign: `/api/sheet-designs/${id}`,
        sheet_design: `/api/sheet-designs/${id}`,
        nestingRun: `/api/nesting-runs/${id}`,
        nesting_run: `/api/nesting-runs/${id}`,
        artifact: `/api/artifacts/${id}`,
        catalog: `/api/catalogs/${id}`,
        color: `/api/colors/${id}`,
        warehouse: `/api/warehouses/${id}`,
        user: `/api/users/${id}`,
        organization: `/api/organizations/${id}`
    };
    return map[type] || `/api/${type}/${id}`;
  };

  const transition = async (entityType, targetId, newState, metadata = {}) => {
    isTransitioning.value = true;
    transitionError.value = null;
    
    try {
      // Use standard PATCH update endpoint which handles status updates
      const response = await $fetch(getStatusEndpoint(entityType, targetId), {
        method: 'PATCH',
        body: { status: newState, statusMeta: metadata }
      });
      return response;
    } catch (err) {
      transitionError.value = err.data?.message || 'Failed to update status';
      throw err;
    } finally {
      isTransitioning.value = false;
    }
  };

  return {
    transition,
    isTransitioning,
    transitionError
  };
};
