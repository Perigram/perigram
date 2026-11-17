const FLOW_DOCUMENT_TYPE = 'text.flow-document';
function badInput(message) { const error = new Error(message); error.status = 400; throw error; }
function extractTable(document) {
  if (document?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(document.blocks)) badInput(`this operation requires a ${FLOW_DOCUMENT_TYPE} value`);
  const table = document.blocks.find(block => block?.type === 'table' && Array.isArray(block.rows));
  if (!table) badInput('the flow document carries no table');
  return table.rows;
}
export function createRuntime() {
  return { execute(operationId, input = {}) {
    if (operationId !== 'extract-table') throw new Error(`Unsupported Documents server operation: ${operationId}`);
    return extractTable(input.document);
  } };
}
