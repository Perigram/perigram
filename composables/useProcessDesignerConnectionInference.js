import { operationKindOf } from '~/packages/cts/src/index.js';
import { propagateConnectionType } from '~/packages/processes/src/index.js';

export function useProcessDesignerConnectionInference({ nodes, draft, resolveOutputs, portForHandle, syncProcessNode }) {
  function inferGenericNodeTypeFromConnection(connection = {}) {
    const sourceNode = nodes.value.find(item => item.id === connection.source);
    const targetNode = nodes.value.find(item => item.id === connection.target);
    const sourceRecord = draft.value?.data?.processNodes?.[sourceNode?.data?.refId];
    const targetRecord = draft.value?.data?.processNodes?.[targetNode?.data?.refId];
    if (!sourceRecord || !targetRecord) return;
    const sourcePort = portForHandle(resolveOutputs(sourceRecord), connection.sourceHandle, 'output');
    if (!sourcePort || sourcePort.role !== 'data') return;
    if (operationKindOf(sourceRecord) === 'control.manualTrigger'
      && !sourceRecord.typeId
      && targetRecord.typeId
      && ['effect.updateEntity', 'record.getField', 'record.getBlock', 'record.deconstruct'].includes(operationKindOf(targetRecord))) {
      sourceRecord.typeId = targetRecord.typeId;
      syncProcessNode(sourceRecord);
    }
    const targetInput = String(connection.targetHandle || '').replace(/^(input|data):/, '');
    propagateConnectionType(targetRecord, targetInput, sourcePort);
    const entryId = targetInput.replace(/^entry:/, '');
    const entry = targetRecord.entries?.find(item => item.id === entryId);
    const connectedTypeId = sourcePort.type?.typeId || sourcePort.type?.itemType?.typeId || sourceRecord.typeId || '';
    if (entry && targetRecord.compositionMode === 'ancestors' && connectedTypeId) {
      entry.typeId = connectedTypeId;
      entry.key = '';
    }
    syncProcessNode(targetRecord);
  }

  return { inferGenericNodeTypeFromConnection };
}
