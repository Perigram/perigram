// Definition-plane record factories (pure): services and sockets are
// definition records, not canvas node records — they are edited in the
// Roles tab's sockets panel and the service surface, so their factories
// live beside the designer utils, not with the process-node record
// factories.

export function createService(id) {
  return {
    id,
    label: id,
    serviceType: '',
    commandId: '',
    inputs: [],
    outputs: [],
    access: { runPrincipals: [], viewPrincipals: [] },
    billing: { mode: 'none', tokenCost: 0, meterKey: '' }
  };
}

export function createSocket(id, direction = 'outbound') {
  return {
    id,
    label: id,
    direction,
    typeId: '',
    projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
    receiverLifecycle: { mode: 'defaultCreated', workflow: null },
    access: { sendRoles: [], receiveRoles: [] }
  };
}
