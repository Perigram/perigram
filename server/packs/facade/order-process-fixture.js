// The facade order process: the composed test process proving the whole
// chain — an uploaded order table becomes one container instance with
// baked cassette-design children, declared sheet materials attach beside
// them, and the nesting service runs once per material with every run
// saved as a child record. Authored in the current species vocabulary
// (graph protocol v5); served as data so server specs and e2e drive the
// same definition.
//
// Species seams the composition rides (SPEC §8): the table's rows arrive
// through the documents pack's declared `rows` projection (the entity→
// value gate — no ref-carrying service exists), template names resolve
// through a `cts.read` of cassettes plus the pure `collection.join`, and
// design geometry reaches the solver through the declared
// `nesting-polygons` projection on cassette-design. The one service,
// `nesting.solve`, is pure V→V: the sheet arrives as values read off the
// material by field projections.
import * as XLSX from 'xlsx/xlsx.mjs';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';
import { PROCESS_DATAFLOW_VERSION } from '#packages/processes/src/index.js';

// The organization's own vocabulary: the order container (group) holding
// the production children and referencing its source table, and the
// per-run record (item). Children edges target the facade pack's system
// types — the org declares containment, the pack declares the child
// contracts.
export const ORDER_TYPE_ID = 'facade-order';
export const ATTEMPT_TYPE_ID = 'nesting-attempt';
export const ORDER_LINEAGE_KEY = 'orderId';
export const ORDER_TABLE_RELATION = 'table';

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
        },
        relations: {
          table: { types: ['xlsx-workbook'] }
        }
      }
    }
  ];
}

// The order table the process imports: one row per cassette design — a
// name, the cassette template it names, and the bake parameters as cells.
// The header row is authored vocabulary: the graph's record-field paths
// (`name`, `cassette`, the parameter keys) ARE the column selection.
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
      // The manual entry is the container construct; its table relation
      // arrives from the run context (a manual-input contract).
      ['order', 'control:completed', 'bake', 'control:in'],
      ['order', 'data:result', 'table', 'data:entity'],
      ['table', 'data:value', 'tableRefs', 'data:value'],
      ['tableRefs', 'data:value', 'firstTable', 'data:items'],
      ['zero', 'data:value', 'firstTable', 'data:index'],
      ['firstTable', 'data:item', 'rows', 'data:entity'],
      ['rows', 'data:result', 'rowName', 'data:value'],
      ['rows', 'data:result', 'bake', 'data:parameters'],
      ['rows', 'data:result', 'join', 'data:left'],
      ['templates', 'data:result', 'join', 'data:right'],
      ['join', 'data:pairs', 'rowTemplate', 'data:value'],
      ['rowTemplate', 'data:value', 'bake', 'data:template'],
      ['rowName', 'data:value', 'bake', 'data:name'],
      ['order', 'data:result', 'bake', `data:lineage.${ORDER_LINEAGE_KEY}`],
      ['bake', 'control:completed', 'materials', 'control:in'],
      ['codes', 'data:value', 'materials', 'data:data.code'],
      ['widths', 'data:value', 'materials', 'data:data.width'],
      ['heights', 'data:value', 'materials', 'data:data.height'],
      ['thicknesses', 'data:value', 'materials', 'data:data.thickness'],
      ['order', 'data:result', 'materials', `data:lineage.${ORDER_LINEAGE_KEY}`],
      ['materials', 'control:completed', 'loop', 'control:in'],
      ['bake', 'data:result', 'polygons', 'data:entity'],
      ['polygons', 'data:result', 'jobItems', 'data:polygonParts'],
      ['one', 'data:value', 'jobItems', 'data:count'],
      ['materials', 'data:result', 'loop', 'data:items'],
      ['loop', 'control:each', 'solve', 'control:in'],
      ['jobItems', 'data:record', 'solve', 'data:items'],
      ['loop', 'data:item', 'matWidth', 'data:entity'],
      ['loop', 'data:item', 'matHeight', 'data:entity'],
      ['matWidth', 'data:value', 'solve', 'data:sheetWidth'],
      ['matHeight', 'data:value', 'solve', 'data:sheetHeight'],
      ['solve', 'control:completed', 'attempt', 'control:in'],
      ['solve', 'data:result', 'attempt', 'data:data.result'],
      ['order', 'data:result', 'attempt', `data:lineage.${ORDER_LINEAGE_KEY}`],
      ['attempt', 'control:completed', 'loopEnd', 'control:in']
    ].map(([source, sourceHandle, target, targetHandle], index) => ({
      id: `e-${index}-${source}-${target}`, source, sourceHandle, target, targetHandle
    }))
  };
}

export function orderProcessDefinition() {
  const processNodes = {
    // The manual entry action: creating the order container is what a
    // user starts; its source table arrives on the construct's
    // construct-addressable relation input (a manual-input contract —
    // an automatically evaluated path could never prompt).
    order: {
      id: 'order', kind: 'cts.construct', typeId: ORDER_TYPE_ID, producerOutputId: 'order:result',
      construction: { mode: 'genericCreate', inputs: [
        { id: 'data.name', label: 'Name', path: 'data.name', type: 'string', required: true, prompt: true },
        { id: `relations.${ORDER_TABLE_RELATION}`, label: 'Order table', path: `relations.${ORDER_TABLE_RELATION}`, type: 'entity', typeId: 'xlsx-workbook', required: true, prompt: true }
      ] },
      inputDefaults: { 'data.name': 'Facade order 42' },
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] }
    },
    // The declared relation carries the table refs on the stored record
    // (relations are many-valued); the first ref feeds the extract read,
    // which turns it into row values through the documents pack's `rows`
    // projection.
    table: { id: 'table', kind: 'cts.field', typeId: ORDER_TYPE_ID, inputDefaults: { field: `relations.${ORDER_TABLE_RELATION}` } },
    tableRefs: { id: 'tableRefs', kind: 'collection.unpackArray', type: { base: 'array', nullable: true, itemType: { base: 'entityRef', typeId: 'xlsx-workbook' } } },
    firstTable: { id: 'firstTable', kind: 'collection.itemAt', type: { base: 'entityRef', typeId: 'xlsx-workbook', nullable: true } },
    zero: { id: 'zero', kind: 'source.literalItem', type: { base: 'integer', nullable: false }, value: 0 },
    rows: { id: 'rows', kind: 'cts.read', typeId: 'xlsx-workbook', select: 'extract', projection: 'rows' },
    rowName: { id: 'rowName', kind: 'value.recordField', path: 'name', type: { base: 'string', nullable: true } },
    // Template resolution without a lookup service: read the cassettes,
    // join rows to them by the authored keys; the matched cassette rides
    // the pair's `right`.
    templates: { id: 'templates', kind: 'cts.read', typeId: 'cassette', select: 'all' },
    join: { id: 'join', kind: 'collection.join', leftKey: 'cassette', rightKey: 'identity.name' },
    rowTemplate: { id: 'rowTemplate', kind: 'value.recordField', path: 'right', type: { base: 'entity', typeId: 'cassette', nullable: true } },
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
    // Job geometry through the declared projection: each design's baked
    // nesting polygons, one job item per design (count authored).
    polygons: { id: 'polygons', kind: 'cts.read', typeId: 'cassette-design', select: 'extract', projection: 'nesting-polygons' },
    jobItems: { id: 'jobItems', kind: 'record.construct', fields: ['polygonParts', 'count'] },
    one: { id: 'one', kind: 'source.literalItem', type: { base: 'number', nullable: false, unit: 'count' }, value: 1 },
    loop: { id: 'loop', kind: 'control.forEach', type: MATERIAL_TYPE },
    // The sheet arrives as values: the loop item is the material entity,
    // the field projections read its dimensions.
    matWidth: { id: 'matWidth', kind: 'cts.field', typeId: 'sheet-material', inputDefaults: { field: 'data.width' } },
    matHeight: { id: 'matHeight', kind: 'cts.field', typeId: 'sheet-material', inputDefaults: { field: 'data.height' } },
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
