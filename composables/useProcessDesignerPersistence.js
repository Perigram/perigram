export function useProcessDesignerPersistence({ request = $fetch } = {}) {
  async function loadWorkspace(organizationId) {
    const [active, definitions, roles] = await Promise.all([
      request('/api/process-definitions/active').catch(() => null),
      request('/api/process-definitions').catch(() => []),
      organizationId ? request(`/api/organizations/${organizationId}/roles`) : {}
    ]);
    return { active, definitions, roles };
  }

  function createDraft({ name, data, sourceProcessDefinitionId = null }) {
    return request('/api/process-definitions', {
      method: 'POST',
      body: { name, data: { ...data, sourceProcessDefinitionId } }
    });
  }

  function saveDraft(id, data) {
    return request(`/api/process-definitions/${id}`, { method: 'PATCH', body: { data } });
  }

  function renameDraft(id, name) {
    return request(`/api/process-definitions/${id}`, { method: 'PATCH', body: { name } });
  }

  function loadProcessById(id) {
    return request(`/api/process-definitions/${id}`);
  }

  function validateDraft(id) {
    return request(`/api/process-definitions/${id}/validate`, { method: 'POST' });
  }

  // `migration` carries the confirmed Apply migration mappings when the
  // next contract removes states still held by live instances.
  function activateDraft(id, migration = null) {
    return request(`/api/process-definitions/${id}/activate`, {
      method: 'POST',
      body: migration ? { migration } : {}
    });
  }

  function previewDraft(definition, nodeId) {
    return request('/api/process-definitions/preview', {
      method: 'POST',
      body: { definition, nodeId, trigger: {}, inputs: {} }
    });
  }

  return { activateDraft, createDraft, loadById: loadProcessById, loadWorkspace, previewDraft, renameDraft, saveDraft, validateDraft };
}
