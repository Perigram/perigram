export function useProcessDesignerRoles({ request = $fetch } = {}) {
  const base = organizationId => `/api/organizations/${organizationId}/roles`;
  return {
    list: organizationId => organizationId ? request(base(organizationId)) : Promise.resolve({}),
    create: (organizationId, label) => request(base(organizationId), { method: 'POST', body: { label } }),
    update: (organizationId, roleId, patch = {}) => request(`${base(organizationId)}/${roleId}`, { method: 'PATCH', body: patch }),
    remove: (organizationId, roleId) => request(`${base(organizationId)}/${roleId}`, { method: 'DELETE' })
  };
}
