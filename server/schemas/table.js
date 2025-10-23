export const tableSchema = {
    columns: [
        {
            name: 'Type',
            required: true,
            type: 'String',
            description: 'Name of the part or file.',
            field: 'type'
        },
        {
            name: 'Amount',
            required: true,
            type: 'Number',
            description: 'Quantity of the part to be nested.',
            validation: (v) => Number.isInteger(v) && v > 0,
            field: 'amount'
        },
        {
            name: 'Rotation',
            required: false,
            type: 'Boolean',
            description: 'Whether the part is allowed to rotate during nesting.',
            field: 'rotation'
        },
        { name: 'A', required: false, type: 'Number', description: 'Custom parameter A.', field: 'a' },
        { name: 'B', required: false, type: 'Number', description: 'Custom parameter B.', field: 'b' },
        { name: 'C', required: false, type: 'Number', description: 'Custom parameter C.', field: 'c' },
        { name: 'D', required: false, type: 'Number', description: 'Custom parameter D.', field: 'd' },
        { name: 'E', required: false, type: 'Number', description: 'Custom parameter E.', field: 'e' },
        { name: 'F', required: false, type: 'Number', description: 'Custom parameter F.', field: 'f' },
        { name: 'G', required: false, type: 'Number', description: 'Custom parameter G.', field: 'g' },
        { name: 'H', required: false, type: 'Number', description: 'Custom parameter H.', field: 'h' },
    ],
    hiddenFields: ['fileSlug'] // Store file slug for nesting but don't display
};
