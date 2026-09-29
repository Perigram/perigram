// The order process's organization vocabulary: the container type and
// its per-run record, authored as CTS declarations through the cts-types
// surface (the same declarations the designer's declaration tree
// compiles to at APPLY). The process graph over them is composed through
// the headless authoring seam by order-process.spec.js — nothing here
// authors executable records.
export const ORDER_TYPE_ID = 'facade-order';
export const ATTEMPT_TYPE_ID = 'nesting-attempt';
export const ORDER_LINEAGE_KEY = 'orderId';
export const ORDER_TABLE_RELATION = 'table';

// The order table accepts the documents pack's table types; a process
// binds one kind (the extract read's projection is type-bound), so the
// declarations expose the relation for both and each composed variant
// selects its own.
export const TABLE_TYPES = ['xlsx-workbook', 'csv-table'];

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
          table: { types: TABLE_TYPES }
        }
      }
    }
  ];
}
