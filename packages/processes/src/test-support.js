export function createTemplate({ id, label, adminLabel, grants, entities, services }) {
  const producerOutputs = Object.fromEntries(Object.entries(entities).map(([nodeId, output]) => {
    const outputSocketId = output.outputSocketId || 'entity';
    const producerOutputId = `${nodeId}:${outputSocketId}`;
    return [producerOutputId, { ...output, producerOutputId, nodeId, outputSocketId }];
  }));
  const organizationRoles = {
    role_admin: {
      id: 'role_admin',
      label: adminLabel
    }
  };
  const roleGrants = {
    role_admin: Object.entries(grants)
      .filter(([, level]) => level && level !== 'none')
      .map(([feature, level]) => ({ feature, level }))
  };
  const servicePrincipals = Object.fromEntries(Object.values(services)
    .flatMap(service => [
      ...(service.access?.runPrincipals || []),
      ...(service.access?.viewPrincipals || [])
    ])
    .map(principalId => [principalId, {
      id: principalId,
      label: principalId.replace(/^principal_/, '').replace(/_/g, ' '),
      kind: 'service'
    }]));
  const graph = {
    nodes: [
      { id: 'role_admin', type: 'role', position: { x: 80, y: 80 }, data: { refId: 'role_admin', label: adminLabel } },
      ...Object.values(producerOutputs).map((output, index) => ({
        id: output.nodeId,
        type: 'entity',
        position: { x: 360, y: 80 + index * 120 },
        data: { refId: output.producerOutputId, label: output.label, typeId: output.typeId }
      })),
      ...Object.keys(services).map((serviceId, index) => ({
        id: serviceId,
        type: 'service',
        position: { x: 660, y: 80 + index * 120 },
        data: { refId: serviceId, label: services[serviceId].label, commandId: services[serviceId].commandId }
      }))
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  return {
    id,
    label,
    organizationRoles,
    definition: {
      schemaVersion: 1,
      dataflowVersion: 4,
      sourceTemplateId: id,
      graph,
      roleGrants,
      servicePrincipals,
      producerOutputs,
      actions: {},
      services,
      sockets: {},
      screens: {},
      compiled: null
    }
  };
}
