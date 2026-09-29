// The facade order process: the composed test process proving the whole
// chain — an uploaded order table becomes one container instance with
// baked cassette-design children, declared sheet materials attach beside
// them, and the nesting service runs once per material with every run
// saved as a child record. Authored in the current species vocabulary
// (graph protocol v5); served as data so server specs and e2e drive the
// same definition. Imports the xlsx ESM build — the CJS main cannot be
// externalized by nitro (root README Development notes).
import * as XLSX from 'xlsx/xlsx.mjs';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';
import { PROCESS_DATAFLOW_VERSION } from '~/packages/processes/src/index.js';

// The organization's own vocabulary: the order container (group) holding
// the production children, and the per-run record (item). Children edges
// target the facade pack's system types — the org declares containment,
// the pack declares the child contracts.
export const ORDER_TYPE_ID = 'facade-order';
export const ATTEMPT_TYPE_ID = 'nesting-attempt';
export const ORDER_LINEAGE_KEY = 'orderId';

export function orderOrgTypeDeclarations() {
  return [
    {
      id: ATTEMPT_TYPE_ID,
      class: 'item',
      name: 'Nesting attempt',
      fields: { label: { base: 'string', identifier: true }, result: { base: 'json' } }
    },
    {
      id: ORDER_TYPE_ID,
      class: 'group',
      name: 'Facade order',
      fields: { name: { base: 'string', identifier: true } },
      edges: {
        children: {
          contents: {
            types: ['cassette-design', 'sheet-material', ATTEMPT_TYPE_ID],
            onRemove: 'restrict',
            lineageKey: ORDER_LINEAGE_KEY
          }
        }
      }
    }
  ];
}

// The order table the process imports: one row per cassette design — a
// name, the cassette template it names, and the bake parameters as cells.
export const ORDER_ROWS = [
  { name: 'Tray A left', templateName: 'Tray 600', parameters: { A: 600, B: 450 } },
  { name: 'Tray B small', templateName: 'Tray 600', parameters: { A: 300, B: 300 } }
];

export function buildOrderTableWorkbookBuffer() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['name', 'cassette', 'A', 'B'],
    ...ORDER_ROWS.map(row => [row.name, row.templateName, row.parameters.A, row.parameters.B])
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Order');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function buildOrderTableCsv() {
  const rows = [['name', 'cassette', 'A', 'B'],
    ...ORDER_ROWS.map(row => [row.name, row.templateName, row.parameters.A, row.parameters.B])];
  return rows.map(row => row.map(cell => /[",]/.test(String(cell)) ? `"${String(cell)}"` : String(cell)).join(',')).join('\n');
}

export function buildCassetteTemplatePayload() {
  return Buffer.from(JSON.stringify(createDefaultOccsCassetteTemplateDefinition()), 'utf8');
}

const MATERIAL_TYPE = { base: 'entity', typeId: 'sheet-material' };

function graph(records) {
  return {
    nodes: Object.keys(records).map(id => ({ id, type: 'processNode', data: { refId: id } })),
    edges: [
      { id: 'e-order-rows', source: 'rows', sourceHandle: 'control:completed', target: 'order', targetHandle: 'control:in' },
      { id: 'e-rows-name', source: 'rows', sourceHandle: 'data:result', target: 'rowName', targetHandle: 'data:value' },
      { id: 'e-rows-template', source: 'rows', sourceHandle: 'data:result', target: 'rowTemplate', targetHandle: 'data:value' },
      { id: 'e-rows-params', source: 'rows', sourceHandle: 'data:result', target: 'rowParams', targetHandle: 'data:value' },
      { id: 'e-order-resolve', source: 'order', sourceHandle: 'control:completed', target: 'resolve', targetHandle: 'control:in' },
      { id: 'e-resolve-names', source: 'rowTemplate', sourceHandle: 'data:value', target: 'resolve', targetHandle: 'data:names' },
      { id: 'e-resolve-bake', source: 'resolve', sourceHandle: 'control:completed', target: 'bake', targetHandle: 'control:in' },
      { id: 'e-bake-template', source: 'resolve', sourceHandle: 'data:result', target: 'bake', targetHandle: 'data:template' },
      { id: 'e-bake-name', source: 'rowName', sourceHandle: 'data:value', target: 'bake', targetHandle: 'data:name' },
      { id: 'e-bake-params', source: 'rowParams', sourceHandle: 'data:value', target: 'bake', targetHandle: 'data:parameters' },
      { id: 'e-bake-lineage', source: 'order', sourceHandle: 'data:result', target: 'bake', targetHandle: `data:lineage.${ORDER_LINEAGE_KEY}` },
      { id: 'e-bake-materials', source: 'bake', sourceHandle: 'control:completed', target: 'materials', targetHandle: 'control:in' },
      { id: 'e-codes', source: 'codes', sourceHandle: 'data:value', target: 'materials', targetHandle: 'data:data.code' },
      { id: 'e-widths', source: 'widths', sourceHandle: 'data:value', target: 'materials', targetHandle: 'data:data.width' },
      { id: 'e-heights', source: 'heights', sourceHandle: 'data:value', target: 'materials', targetHandle: 'data:data.height' },
      { id: 'e-thicknesses', source: 'thicknesses', sourceHandle: 'data:value', target: 'materials', targetHandle: 'data:data.thickness' },
      { id: 'e-order-materials', source: 'order', sourceHandle: 'data:result', target: 'materials', targetHandle: `data:lineage.${ORDER_LINEAGE_KEY}` },
      { id: 'e-materials-items', source: 'materials', sourceHandle: 'control:completed', target: 'items', targetHandle: 'control:in' },
      { id: 'e-bake-items', source: 'bake', sourceHandle: 'data:result', target: 'items', targetHandle: 'data:designs' },
      { id: 'e-items-loop', source: 'items', sourceHandle: 'control:completed', target: 'loop', targetHandle: 'control:in' },
      { id: 'e-materials-loop', source: 'materials', sourceHandle: 'data:result', target: 'loop', targetHandle: 'data:items' },
      { id: 'e-loop-solve', source: 'loop', sourceHandle: 'control:each', target: 'solve', targetHandle: 'control:in' },
      { id: 'e-items-solve', source: 'items', sourceHandle: 'data:result', target: 'solve', targetHandle: 'data:items' },
      { id: 'e-loop-material', source: 'loop', sourceHandle: 'data:item', target: 'solve', targetHandle: 'data:material' },
      { id: 'e-solve-attempt', source: 'solve', sourceHandle: 'control:completed', target: 'attempt', targetHandle: 'control:in' },
      { id: 'e-solve-result', source: 'solve', sourceHandle: 'data:result', target: 'attempt', targetHandle: 'data:data.result' },
      { id: 'e-order-attempt', source: 'order', sourceHandle: 'data:result', target: 'attempt', targetHandle: `data:lineage.${ORDER_LINEAGE_KEY}` },
      { id: 'e-attempt-end', source: 'attempt', sourceHandle: 'control:completed', target: 'loopEnd', targetHandle: 'control:in' }
    ]
  };
}

export function orderProcessDefinition() {
  const processNodes = {
    // The manual entry action: reading the order table is what a user
    // starts; its `source` arrives from the run context (a manual-input
    // contract — an automatically evaluated path could never prompt).
    rows: { id: 'rows', kind: 'cts.service', operator: 'orders.readRows', trigger: { mode: 'manual' }, access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] } },
    order: {
      id: 'order', kind: 'cts.construct', typeId: ORDER_TYPE_ID, producerOutputId: 'order:result',
      construction: { mode: 'genericCreate', inputs: [
        { id: 'data.name', label: 'Name', path: 'data.name', type: 'string', required: true, prompt: true }
      ] },
      inputDefaults: { 'data.name': 'Facade order 42' },
      trigger: { mode: 'event' }
    },
    rowName: { id: 'rowName', kind: 'value.recordField', path: 'name', type: { base: 'string', nullable: true } },
    rowTemplate: { id: 'rowTemplate', kind: 'value.recordField', path: 'templateName', type: { base: 'string', nullable: true } },
    rowParams: { id: 'rowParams', kind: 'value.recordField', path: 'parameters', type: { base: 'json', nullable: true } },
    resolve: { id: 'resolve', kind: 'cts.service', operator: 'cassettes.resolveByName', trigger: { mode: 'event' } },
    bake: {
      id: 'bake', kind: 'cts.construct', typeId: 'cassette-design', producerOutputId: 'bake:result',
      construction: { mode: 'bake', inputs: [
        { id: 'name', label: 'Name', path: 'name', type: 'string', required: false },
        { id: 'template', label: 'Template', path: 'template', type: 'entity', typeId: 'cassette', required: true },
        { id: 'parameters', label: 'Parameters', path: 'parameters', type: 'object', required: false },
        { id: `lineage.${ORDER_LINEAGE_KEY}`, label: 'Facade order', path: `lineage.${ORDER_LINEAGE_KEY}`, type: 'entity', typeId: ORDER_TYPE_ID, required: false }
      ] },
      trigger: { mode: 'event' }
    },
    // The declared materials, created as one aligned-tuple multi-create:
    // each literalList is a scalar-typed List source, so the construct
    // emits one sheet-material per aligned tuple under the order's
    // lineage — no per-material branch, no producer convergence.
    codes: { id: 'codes', kind: 'source.literalList', type: { base: 'string', nullable: false }, value: ['ACM-1250x2500-04', 'ACM-1500x3000-06'] },
    widths: { id: 'widths', kind: 'source.literalList', type: { base: 'number', nullable: false, unit: 'mm' }, value: [1250, 1500] },
    heights: { id: 'heights', kind: 'source.literalList', type: { base: 'number', nullable: false, unit: 'mm' }, value: [2500, 3000] },
    thicknesses: { id: 'thicknesses', kind: 'source.literalList', type: { base: 'number', nullable: false, unit: 'mm' }, value: [4, 6] },
    materials: {
      id: 'materials', kind: 'cts.construct', typeId: 'sheet-material', producerOutputId: 'materials:result',
      construction: { mode: 'genericCreate', inputs: [
        { id: 'data.code', label: 'Code', path: 'data.code', type: 'string', required: true, prompt: true },
        { id: 'data.width', label: 'Width', path: 'data.width', type: 'number', unit: 'mm', required: true, prompt: true },
        { id: 'data.height', label: 'Height', path: 'data.height', type: 'number', unit: 'mm', required: true, prompt: true },
        { id: 'data.thickness', label: 'Thickness', path: 'data.thickness', type: 'number', unit: 'mm', required: true, prompt: true },
        { id: `lineage.${ORDER_LINEAGE_KEY}`, label: 'Facade order', path: `lineage.${ORDER_LINEAGE_KEY}`, type: 'entity', typeId: ORDER_TYPE_ID, required: false }
      ] },
      trigger: { mode: 'event' }
    },
    items: { id: 'items', kind: 'cts.service', operator: 'nesting.items', trigger: { mode: 'event' } },
    loop: { id: 'loop', kind: 'control.forEach', type: MATERIAL_TYPE },
    solve: { id: 'solve', kind: 'cts.service', operator: 'nesting.solve', trigger: { mode: 'event' } },
    attempt: {
      id: 'attempt', kind: 'cts.construct', typeId: ATTEMPT_TYPE_ID, producerOutputId: 'attempt:result',
      construction: { mode: 'genericCreate', inputs: [
        { id: 'data.label', label: 'Label', path: 'data.label', type: 'string', required: true, prompt: true },
        { id: 'data.result', label: 'Result', path: 'data.result', type: 'object', required: true, prompt: true },
        { id: `lineage.${ORDER_LINEAGE_KEY}`, label: 'Facade order', path: `lineage.${ORDER_LINEAGE_KEY}`, type: 'entity', typeId: ORDER_TYPE_ID, required: false }
      ] },
      inputDefaults: { 'data.label': 'Nesting run' },
      trigger: { mode: 'event' }
    },
    loopEnd: { id: 'loopEnd', kind: 'control.forEachEnd' }
  };

  const producerOutput = (nodeId, typeId) => ({
    id: `${nodeId}:result`, producerOutputId: `${nodeId}:result`, nodeId, outputSocketId: 'result',
    typeId, lifecycle: { mode: 'domainDefault' },
    fields: { read: ['identity.*'], write: [], private: [] }
  });

  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graphProtocol: 5,
    graph: graph(processNodes),
    roleGrants: {},
    producerOutputs: {
      'order:result': producerOutput('order', ORDER_TYPE_ID),
      'bake:result': producerOutput('bake', 'cassette-design'),
      'materials:result': producerOutput('materials', 'sheet-material'),
      'attempt:result': producerOutput('attempt', ATTEMPT_TYPE_ID)
    },
    actions: {}, services: {}, sockets: {}, screens: {},
    processNodes
  };
}
