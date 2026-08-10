export function useProcessDesignerConnectionInference({ nodes, draft, resolveOutputs, portForHandle, syncProcessNode }) {
  const genericKinds = new Set([
    'collection.makeList',
    'collection.packArray',
    'collection.unpackArray',
    'collection.concat',
    'collection.itemAt',
    'collection.slice',
    'collection.count',
    'collection.distinct',
    'collection.sort',
    'collection.groupBy',
    'collection.filter',
    'tree.flatten',
    'tree.graft',
    'tree.simplify',
    'tree.branch',
    'tree.zip',
    'tree.unzip',
    'tree.cross',
    'tree.transpose'
  ]);

  function inferGenericNodeTypeFromConnection(connection = {}) {
    const sourceNode = nodes.value.find(item => item.id === connection.source);
    const targetNode = nodes.value.find(item => item.id === connection.target);
    const sourceRecord = draft.value?.data?.processNodes?.[sourceNode?.data?.refId];
    const targetRecord = draft.value?.data?.processNodes?.[targetNode?.data?.refId];
    if (!sourceRecord || !targetRecord) return;
    const sourcePort = portForHandle(resolveOutputs(sourceRecord), connection.sourceHandle, 'output');
    if (!sourcePort || sourcePort.role !== 'data') return;
    if (sourceRecord.kind === 'control.manualTrigger'
      && !sourceRecord.entityType
      && targetRecord.entityType
      && ['effect.updateEntity', 'record.getField', 'record.getBlock', 'record.deconstruct'].includes(targetRecord.kind)) {
      sourceRecord.entityType = targetRecord.entityType;
      syncProcessNode(sourceRecord);
    }
    const targetInput = String(connection.targetHandle || '').replace(/^(input|data):/, '');
    const drivesGenericType = !targetInput || ['value', 'items', 'tree', 'left'].includes(targetInput);
    if (genericKinds.has(targetRecord.kind) && drivesGenericType) targetRecord.type = { ...sourcePort.type };
    if (targetRecord.kind === 'value.logic' && ['left', 'value', ''].includes(targetInput)) targetRecord.type = { ...sourcePort.type };
    if (['value.string', 'value.math', 'value.dateTime'].includes(targetRecord.kind)
      && ['left', 'text', 'date', 'value', ''].includes(targetInput)) {
      targetRecord.type = { ...sourcePort.type };
    }
    const entryId = targetInput.replace(/^entry:/, '');
    const entry = targetRecord.entries?.find(item => item.id === entryId);
    const connectedEntityType = sourcePort.type?.entityType || sourcePort.type?.itemType?.entityType || sourceRecord.entityType || '';
    if (entry && targetRecord.compositionMode === 'ancestors' && connectedEntityType) {
      entry.entityType = connectedEntityType;
      entry.key = '';
    }
    syncProcessNode(targetRecord);
  }

  return { inferGenericNodeTypeFromConnection };
}
